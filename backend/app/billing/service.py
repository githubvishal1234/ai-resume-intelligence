"""Pro billing with Razorpay subscriptions.

Flow: `checkout` creates a subscription on the chosen plan and returns its id for Razorpay
Checkout; `verify` checks Checkout's signature against the id stored here and switches Pro on;
webhooks keep the state current afterwards (renewals, failed charges, cancellations). A user
is on Pro while a subscription of theirs is in `PRO_STATUSES`; there is no separate plan flag.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.repository import AuditRepository
from app.billing.razorpay import (
    BillingProviderFailed,
    RazorpayClient,
    payment_signature,
    signature_matches,
    webhook_signature,
)
from app.core.config import Settings
from app.core.errors import AppError, Conflict, NotFound, ServiceUnavailable
from app.models import BillingEvent, Subscription, User
from app.models.billing import PRO_STATUSES, SUBSCRIPTION_STATUSES

logger = logging.getLogger(__name__)

Interval = Literal["monthly", "yearly"]
# Prices in paise. The same prices are shown by frontend/src/constants/pricing.ts (a test keeps
# them equal); Razorpay charges what the plan created from these says.
PRICE_PAISE: dict[str, int] = {"monthly": 29_900, "yearly": 249_900}
# Billing cycles per subscription: 10 years either way. Razorpay needs a count.
TOTAL_COUNT: dict[str, int] = {"monthly": 120, "yearly": 10}
# An unpaid subscription can be paid for this long, then Razorpay refuses it. Checkout reuses
# one only while it has at least CHECKOUT_REUSE_MARGIN left, so it can't expire mid-payment.
CHECKOUT_TTL = timedelta(minutes=30)
CHECKOUT_REUSE_MARGIN = timedelta(minutes=10)


class BillingNotConfigured(ServiceUnavailable):
    code = "BILLING_NOT_CONFIGURED"
    message = "Payments are not set up yet. Join the Pro waitlist instead."


class AlreadyPro(Conflict):
    code = "ALREADY_PRO"
    message = "You're already on Pro."


class DuplicatePayment(Conflict):
    code = "DUPLICATE_PAYMENT"
    message = (
        "You already have Pro, so this payment was not applied. It has been recorded so it can "
        "be refunded."
    )


class BillingCancelUnavailable(ServiceUnavailable):
    code = "BILLING_CANCEL_UNAVAILABLE"
    message = (
        "Your Pro subscription has to be cancelled before the account can be deleted, and the "
        "payment provider can't be reached right now. Please try again later."
    )


class PaymentSignatureInvalid(AppError):
    code = "PAYMENT_SIGNATURE_INVALID"
    message = (
        "The payment could not be verified. If you were charged, it will be confirmed shortly."
    )


class WebhookRejected(AppError):
    code = "WEBHOOK_REJECTED"
    message = "Webhook rejected."


def billing_configured(settings: Settings) -> bool:
    return all(
        (
            settings.razorpay_key_id,
            settings.razorpay_key_secret,
            settings.razorpay_webhook_secret,
            settings.razorpay_plan_monthly,
            settings.razorpay_plan_yearly,
        )
    )


def live_subscription(db: Session, owner_id: uuid.UUID) -> Subscription | None:
    return db.scalar(
        select(Subscription).where(
            Subscription.owner_id == owner_id, Subscription.status.in_(PRO_STATUSES)
        )
    )


def ai_daily_limit(db: Session, owner_id: uuid.UUID, settings: Settings) -> tuple[int, bool]:
    """(limit, on_free_plan). Without billing everyone gets the full allowance, as before."""
    if not billing_configured(settings) or live_subscription(db, owner_id) is not None:
        return settings.ai_daily_limit_per_user, False
    return settings.ai_daily_limit_free, True


def _obj(value: Any) -> dict[str, Any]:
    """A JSON object, or {} for anything else, so odd but signed payloads can't crash."""
    return value if isinstance(value, dict) else {}


def _ts(value: Any) -> datetime | None:
    return (
        datetime.fromtimestamp(value, UTC) if isinstance(value, int | float) and value > 0 else None
    )


class BillingService:
    def __init__(
        self, db: Session, settings: Settings, user: User, request_id: str | None = None
    ) -> None:
        self.db = db
        self.settings = settings
        self.user = user
        self.request_id = request_id
        self.audit = AuditRepository(db)

    @property
    def configured(self) -> bool:
        return billing_configured(self.settings)

    def live(self) -> Subscription | None:
        return live_subscription(self.db, self.user.id)

    def checkout(self, interval: Interval) -> Subscription:
        """A subscription waiting for Checkout. Reuses an unpaid one for the same plan."""
        self._require_configured()
        if self.live() is not None:
            raise AlreadyPro()
        now = datetime.now(UTC)
        unpaid = list(
            self.db.scalars(
                select(Subscription).where(
                    Subscription.owner_id == self.user.id, Subscription.status == "created"
                )
            )
        )
        for old in unpaid:
            if (
                old.interval == interval
                and old.created_at > now - CHECKOUT_TTL + CHECKOUT_REUSE_MARGIN
            ):
                return old
        client = RazorpayClient(self.settings)
        # Only one unpaid subscription may be payable at a time, so nobody can pay twice
        # (say monthly in one tab and yearly in another). Older ones are cancelled first.
        for old in unpaid:
            if old.created_at > now - CHECKOUT_TTL:
                client.cancel_subscription(old.provider_subscription_id, at_cycle_end=False)
            old.status = "cancelled"
        plan_id = (
            self.settings.razorpay_plan_monthly
            if interval == "monthly"
            else self.settings.razorpay_plan_yearly
        )
        created = client.create_subscription(
            plan_id=plan_id or "",
            total_count=TOTAL_COUNT[interval],
            notes={"user_id": str(self.user.id)},
            expire_by=int((now + CHECKOUT_TTL).timestamp()),
        )
        provider_id = str(created.get("id") or "")
        if not provider_id:
            raise BillingProviderFailed("The payment provider did not return a subscription.")
        sub = Subscription(
            owner_id=self.user.id,
            provider_subscription_id=provider_id,
            interval=interval,
            status="created",
        )
        self.db.add(sub)
        self._audit("billing.checkout_started", sub)
        self.db.commit()
        return sub

    def verify(self, payment_id: str, subscription_id: str, signature: str) -> Subscription:
        """Checks Checkout's signature with the id stored here, then switches Pro on."""
        self._require_configured()
        sub = self.db.scalar(
            select(Subscription).where(
                Subscription.owner_id == self.user.id,
                Subscription.provider_subscription_id == subscription_id,
            )
        )
        if sub is None:
            raise NotFound("That subscription was not found.")
        secret = self.settings.razorpay_key_secret
        expected = payment_signature(
            payment_id, sub.provider_subscription_id, secret.get_secret_value() if secret else ""
        )
        if not signature_matches(expected, signature):
            self._audit("billing.verify_failed", sub, outcome="failure")
            self.db.commit()
            raise PaymentSignatureInvalid()
        if sub.status == "created":  # a webhook may already have moved it further
            sub.status = "authenticated"
        self._audit("billing.verified", sub)
        try:
            self.db.commit()
        except IntegrityError:  # a second paid subscription while one is already live
            self.db.rollback()
            logger.error("billing.duplicate_payment", extra={"subscription": subscription_id})
            self._audit("billing.duplicate_payment", sub, outcome="failure")
            self.db.commit()
            raise DuplicatePayment() from None
        return sub

    def cancel(self) -> Subscription:
        """Cancels at the end of the paid period, so the time already paid for is kept."""
        self._require_configured()
        sub = self.live()
        if sub is None:
            raise NotFound("You don't have an active Pro subscription.")
        if not sub.cancel_at_period_end:
            RazorpayClient(self.settings).cancel_subscription(
                sub.provider_subscription_id, at_cycle_end=True
            )
            sub.cancel_at_period_end = True
            self._audit("billing.cancel_scheduled", sub)
            self.db.commit()
        return sub

    def cancel_now_for_deletion(self) -> None:
        """Account deletion: stop future charges first. If Razorpay can't be reached, this
        raises and the account is not deleted, so a deleted user is never billed again."""
        sub = self.live()
        if sub is None:
            return
        if not self.configured:  # keys removed: we could not stop the charges, so refuse
            raise BillingCancelUnavailable()
        RazorpayClient(self.settings).cancel_subscription(
            sub.provider_subscription_id, at_cycle_end=False
        )

    def _require_configured(self) -> None:
        if not self.configured:
            raise BillingNotConfigured()

    def _audit(self, action: str, sub: Subscription, outcome: str = "success") -> None:
        self.audit.record(
            action=action,
            outcome=outcome,
            actor_user_id=self.user.id,
            request_id=self.request_id,
            resource_type="subscription",
            resource_id=sub.provider_subscription_id,
            details={"interval": sub.interval, "status": sub.status},
        )


def handle_webhook(
    db: Session, settings: Settings, raw: bytes, signature: str | None, event_id: str | None
) -> bool:
    """Applies one Razorpay webhook. Returns whether it changed a subscription.

    The signature is checked on the exact bytes received. Events are deduplicated on their
    id, and an event older than the last one applied to a subscription is recorded but not
    applied (Razorpay may deliver out of order).
    """
    secret = settings.razorpay_webhook_secret
    if not billing_configured(settings) or secret is None:
        raise BillingNotConfigured()
    if not signature_matches(webhook_signature(raw, secret.get_secret_value()), signature):
        raise WebhookRejected()
    try:
        data = json.loads(raw)
    except ValueError:
        raise WebhookRejected() from None
    if not isinstance(data, dict) or not event_id:
        raise WebhookRejected()

    event_type = str(data.get("event") or "unknown")[:64]
    entity = _obj(_obj(_obj(data.get("payload")).get("subscription")).get("entity"))
    provider_id = str(entity.get("id") or "")[:64] or None
    status = entity.get("status") if entity.get("status") in SUBSCRIPTION_STATUSES else None
    event = BillingEvent(
        event_id=event_id[:64],
        event_type=event_type,
        provider_subscription_id=provider_id,
        status=status,
    )
    db.add(event)
    try:
        db.flush()
    except IntegrityError:  # already received: Razorpay delivers at least once
        db.rollback()
        return False

    sub = (
        db.scalar(select(Subscription).where(Subscription.provider_subscription_id == provider_id))
        if provider_id
        else None
    )
    happened = _ts(data.get("created_at")) or datetime.now(UTC)
    if sub is not None and status and (sub.last_event_at is None or happened >= sub.last_event_at):
        sub.status = status
        sub.current_end = _ts(entity.get("current_end")) or sub.current_end
        sub.last_event_at = happened
        event.applied = True
    try:
        db.commit()
    except IntegrityError:
        # A second live subscription for the same user (the one-live index). Keep the event,
        # flag it for a person to resolve: the payment provider holds the money either way.
        db.rollback()
        logger.error("billing.second_live_subscription", extra={"subscription": provider_id})
        db.add(
            BillingEvent(
                event_id=event_id[:64],
                event_type=event_type,
                provider_subscription_id=provider_id,
                status=status,
            )
        )
        db.commit()
        return False
    return event.applied
