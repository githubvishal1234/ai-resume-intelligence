from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.deps import CurrentAuth
from app.auth.router import check_rate_limit
from app.billing.service import BillingService, Interval, ai_daily_limit, handle_webhook
from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.db.session import get_db
from app.models import Subscription
from app.models.billing import PRO_STATUSES

router = APIRouter(prefix="/billing", tags=["billing"])

# Razorpay webhooks are a few kilobytes; anything far larger is refused before it is read whole.
MAX_WEBHOOK_BYTES = 256 * 1024


class WebhookTooLarge(AppError):
    status_code = 413
    code = "WEBHOOK_TOO_LARGE"
    message = "Webhook body too large."


def get_billing_service(
    request: Request,
    auth: CurrentAuth,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> BillingService:
    return BillingService(db, settings, auth.user, request.scope.get("state", {}).get("request_id"))


Service = Annotated[BillingService, Depends(get_billing_service)]


class SubscriptionOut(BaseModel):
    interval: Interval
    status: str
    current_end: datetime | None
    cancel_at_period_end: bool


class BillingOut(BaseModel):
    configured: bool  # false => payments are not set up; the UI offers the waitlist
    plan: Literal["free", "pro"]
    ai_daily_limit: int  # 0 means no limit
    subscription: SubscriptionOut | None


class CheckoutIn(BaseModel):
    interval: Interval


class CheckoutOut(BaseModel):
    key_id: str
    subscription_id: str
    interval: Interval


class VerifyIn(BaseModel):
    razorpay_payment_id: str = Field(min_length=1, max_length=64)
    razorpay_subscription_id: str = Field(min_length=1, max_length=64)
    razorpay_signature: str = Field(min_length=1, max_length=128)


class WebhookOut(BaseModel):
    received: bool


def _out(service: BillingService, sub: Subscription | None = None) -> BillingOut:
    live = sub if sub is not None and sub.status in PRO_STATUSES else service.live()
    limit, _ = ai_daily_limit(service.db, service.user.id, service.settings)
    return BillingOut(
        configured=service.configured,
        plan="pro" if live is not None else "free",
        ai_daily_limit=limit,
        subscription=SubscriptionOut(
            interval="yearly" if live.interval == "yearly" else "monthly",
            status=live.status,
            current_end=live.current_end,
            cancel_at_period_end=live.cancel_at_period_end,
        )
        if live is not None
        else None,
    )


@router.get("", response_model=BillingOut)
def get_billing(service: Service) -> BillingOut:
    return _out(service)


@router.post("/checkout", response_model=CheckoutOut)
def checkout(body: CheckoutIn, service: Service) -> CheckoutOut:
    check_rate_limit("billing", f"user:{service.user.id}", service.settings)
    sub = service.checkout(body.interval)
    return CheckoutOut(
        key_id=service.settings.razorpay_key_id or "",
        subscription_id=sub.provider_subscription_id,
        interval=body.interval,
    )


@router.post("/verify", response_model=BillingOut)
def verify(body: VerifyIn, service: Service) -> BillingOut:
    check_rate_limit("billing", f"user:{service.user.id}", service.settings)
    sub = service.verify(
        body.razorpay_payment_id, body.razorpay_subscription_id, body.razorpay_signature
    )
    return _out(service, sub)


@router.post("/cancel", response_model=BillingOut)
def cancel(service: Service) -> BillingOut:
    return _out(service, service.cancel())


@router.post("/webhooks/razorpay", response_model=WebhookOut, include_in_schema=False)
async def razorpay_webhook(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> WebhookOut:
    """Called by Razorpay, not the browser: no session or CSRF; the signature authenticates it."""
    if int(request.headers.get("content-length") or 0) > MAX_WEBHOOK_BYTES:
        raise WebhookTooLarge()
    raw = b""
    async for chunk in request.stream():
        raw += chunk
        if len(raw) > MAX_WEBHOOK_BYTES:
            raise WebhookTooLarge()
    handle_webhook(
        db,
        settings,
        raw,
        request.headers.get("x-razorpay-signature"),
        request.headers.get("x-razorpay-event-id"),
    )
    return WebhookOut(received=True)
