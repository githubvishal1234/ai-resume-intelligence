"""Razorpay Subscriptions over plain HTTPS (basic auth, JSON), with no vendor SDK.

Only what Pro billing needs: create a plan, create and cancel a subscription, and the two
HMAC-SHA256 signatures (Checkout's payment signature and the webhook signature). Errors carry
the HTTP status and Razorpay's error code only, never keys or payment details.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import urllib.error
import urllib.request
from typing import Any

from app.core.config import Settings
from app.core.errors import AppError


class BillingProviderFailed(AppError):
    status_code = 502
    code = "BILLING_PROVIDER_FAILED"
    message = "The payment provider could not complete the request. Please try again."


def _hmac_hex(secret: str, message: bytes) -> str:
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def payment_signature(payment_id: str, subscription_id: str, key_secret: str) -> str:
    """Checkout's `razorpay_signature` for a subscription. `subscription_id` must be the id
    the server stored, not the one the browser sent back."""
    return _hmac_hex(key_secret, f"{payment_id}|{subscription_id}".encode())


def webhook_signature(raw_body: bytes, webhook_secret: str) -> str:
    """`X-Razorpay-Signature`: computed over the exact bytes received, never re-serialized JSON."""
    return _hmac_hex(webhook_secret, raw_body)


def signature_matches(expected: str, given: str | None) -> bool:
    return bool(given) and hmac.compare_digest(expected, given or "")


class RazorpayClient:
    def __init__(self, settings: Settings) -> None:
        if not settings.razorpay_key_id or not settings.razorpay_key_secret:
            raise ValueError("Razorpay keys are not set.")
        token = f"{settings.razorpay_key_id}:{settings.razorpay_key_secret.get_secret_value()}"
        self._auth = "Basic " + base64.b64encode(token.encode()).decode()
        self.base = settings.razorpay_api_base.rstrip("/")
        self.timeout = settings.razorpay_timeout_seconds

    def create_plan(self, *, period: str, amount_paise: int, name: str) -> dict[str, Any]:
        return self._call(
            "POST",
            "/plans",
            {
                "period": period,
                "interval": 1,
                "item": {"name": name, "amount": amount_paise, "currency": "INR"},
            },
        )

    def create_subscription(
        self, *, plan_id: str, total_count: int, notes: dict[str, str]
    ) -> dict[str, Any]:
        return self._call(
            "POST",
            "/subscriptions",
            {"plan_id": plan_id, "total_count": total_count, "notes": notes},
        )

    def cancel_subscription(self, subscription_id: str, *, at_cycle_end: bool) -> dict[str, Any]:
        # ponytail: option name per Razorpay's Cancel Subscription reference; confirm in test mode.
        return self._call(
            "POST",
            f"/subscriptions/{subscription_id}/cancel",
            {"cancel_at_cycle_end": 1 if at_cycle_end else 0},
        )

    def _call(self, method: str, path: str, body: dict[str, Any]) -> dict[str, Any]:
        req = urllib.request.Request(  # noqa: S310 - base URL comes from settings (https in prod)
            self.base + path,
            data=json.dumps(body).encode(),
            method=method,
            headers={"Authorization": self._auth, "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:  # noqa: S310
                data = json.loads(resp.read() or b"{}")
        except urllib.error.HTTPError as exc:
            try:
                code = json.loads(exc.read() or b"{}").get("error", {}).get("code", "")
            except ValueError:
                code = ""
            raise BillingProviderFailed(
                f"The payment provider refused the request ({exc.code} {code}).".replace(" )", ")")
            ) from None
        except (urllib.error.URLError, OSError, ValueError) as exc:
            raise BillingProviderFailed(
                f"The payment provider is unreachable ({type(exc).__name__})."
            ) from None
        if not isinstance(data, dict):
            raise BillingProviderFailed("The payment provider returned an unexpected answer.")
        return data
