"""Phase 20: Pro billing with Razorpay subscriptions (against a local stand-in, no network)."""

from __future__ import annotations

import base64
import json
import pathlib
import re
import threading
from collections.abc import Callable, Iterator
from datetime import UTC, datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import SecretStr, ValidationError
from sqlalchemy import select, update

from app.ai.registry import register_provider, unregister_provider
from app.billing.razorpay import payment_signature, webhook_signature
from app.billing.service import PRICE_PAISE
from app.core.config import Settings, get_settings
from app.db.session import get_sessionmaker
from app.models import AiUsage, AuditLog, BillingEvent, Subscription, User
from tests.conftest import STRONG_PASSWORD, login_as
from tests.test_claims import _Stub
from tests.test_tailoring import API as TAILOR_API
from tests.test_tailoring import _change, _session

BILLING = "/api/v1/billing"
WEBHOOK = f"{BILLING}/webhooks/razorpay"
KEY_ID, KEY_SECRET, WEBHOOK_SECRET = "rzp_test_key", "key_secret_test", "whsec_test"


class FakeRazorpay:
    """Answers the three calls billing makes, after checking HTTP basic auth."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict[str, Any]]] = []
        self.fail_with: int | None = None
        self.next_id = 0
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args: object) -> None:
                pass

            def do_POST(self) -> None:  # noqa: N802
                body = json.loads(self.rfile.read(int(self.headers["content-length"])) or b"{}")
                expected = "Basic " + base64.b64encode(f"{KEY_ID}:{KEY_SECRET}".encode()).decode()
                if self.headers.get("authorization") != expected:
                    return self._answer(401, {"error": {"code": "BAD_REQUEST_ERROR"}})
                outer.calls.append(("POST", self.path, body))
                if outer.fail_with:
                    return self._answer(outer.fail_with, {"error": {"code": "SERVER_ERROR"}})
                outer.next_id += 1
                if self.path == "/v1/subscriptions":
                    return self._answer(200, {"id": f"sub_{outer.next_id}", "status": "created"})
                if self.path == "/v1/plans":
                    return self._answer(200, {"id": f"plan_{outer.next_id}"})
                return self._answer(200, {"id": self.path.split("/")[3], "status": "cancelled"})

            def _answer(self, status: int, payload: dict[str, Any]) -> None:
                data = json.dumps(payload).encode()
                self.send_response(status)
                self.send_header("content-type", "application/json")
                self.send_header("content-length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}/v1"


@pytest.fixture
def razorpay(app: FastAPI, settings: Settings) -> Iterator[FakeRazorpay]:
    fake = FakeRazorpay()
    app.dependency_overrides[get_settings] = lambda: settings.model_copy(
        update={
            "razorpay_key_id": KEY_ID,
            "razorpay_key_secret": SecretStr(KEY_SECRET),
            "razorpay_webhook_secret": SecretStr(WEBHOOK_SECRET),
            "razorpay_plan_monthly": "plan_monthly",
            "razorpay_plan_yearly": "plan_yearly",
            "razorpay_api_base": fake.base,
            "llm_provider": "fake",
            "llm_model": "fake-1",
        }
    )
    register_provider("fake", lambda s: _Stub())
    yield fake
    unregister_provider("fake")
    fake.server.shutdown()


def _pay(client: TestClient, interval: str = "monthly") -> str:
    """Checkout plus a correctly signed verification. Returns the subscription id."""
    sub_id = client.post(f"{BILLING}/checkout", json={"interval": interval}).json()[
        "subscription_id"
    ]
    verified = client.post(
        f"{BILLING}/verify",
        json={
            "razorpay_payment_id": "pay_1",
            "razorpay_subscription_id": sub_id,
            "razorpay_signature": payment_signature("pay_1", sub_id, KEY_SECRET),
        },
    )
    assert verified.status_code == 200, verified.text
    return sub_id


def _event(
    sub_id: str, status: str, created_at: int, event: str = "subscription.activated"
) -> bytes:
    return json.dumps(
        {
            "event": event,
            "created_at": created_at,
            "payload": {
                "subscription": {
                    "entity": {"id": sub_id, "status": status, "current_end": 1_900_000_000}
                }
            },
        }
    ).encode()


def _send(client: TestClient, raw: bytes, event_id: str, secret: str = WEBHOOK_SECRET) -> int:
    response = client.post(
        WEBHOOK,
        content=raw,
        headers={
            "x-razorpay-signature": webhook_signature(raw, secret),
            "x-razorpay-event-id": event_id,
            "content-type": "application/json",
        },
    )
    return response.status_code


def _sub(sub_id: str) -> Subscription:
    with get_sessionmaker()() as db:
        found = db.scalar(
            select(Subscription).where(Subscription.provider_subscription_id == sub_id)
        )
        assert found is not None
        return found


# ---- signatures and config ----------------------------------------------------------------
def test_signatures_match_fixed_vectors() -> None:
    # payment: HMAC_SHA256(payment_id + "|" + subscription_id, key_secret); webhook: over raw body.
    assert payment_signature("pay_123", "sub_456", "key_secret_test") == (
        "da12d7ad9f06ae85bbb245159b9da6e225b46de2e2cefcad38e2ffea7377a431"
    )
    assert webhook_signature(b'{"event":"ping"}', "whsec_test") == (
        "645e86a36ef1ed458be359c7d3c57737f8a202a88274a809a507f208ba54d991"
    )


def test_production_refuses_test_keys() -> None:
    with pytest.raises(ValidationError, match="RAZORPAY_KEY_ID is a test-mode key"):
        Settings(
            app_env="production",
            database_url="mssql+pyodbc://u:p@db/prod",
            session_cookie_secure=True,
            razorpay_key_id="rzp_test_abc",
        )


def test_prices_match_the_pricing_page() -> None:
    pricing = pathlib.Path(__file__).parents[2] / "frontend/src/constants/pricing.ts"
    match = re.search(r"monthly:\s*(\d+),\s*yearly:\s*(\d+)", pricing.read_text(encoding="utf-8"))
    assert match, "PRO_PRICE not found in pricing.ts"
    assert (int(match[1]) * 100, int(match[2]) * 100) == (
        PRICE_PAISE["monthly"],
        PRICE_PAISE["yearly"],
    )


# ---- billing not set up ---------------------------------------------------------------------
def test_without_billing_everyone_keeps_the_full_allowance(user_client: TestClient) -> None:
    assert user_client.get(BILLING).json() == {
        "configured": False,
        "plan": "free",
        "ai_daily_limit": 100,
        "subscription": None,
    }
    refused = user_client.post(f"{BILLING}/checkout", json={"interval": "monthly"})
    assert refused.status_code == 503
    assert refused.json()["code"] == "BILLING_NOT_CONFIGURED"


# ---- checkout and verification --------------------------------------------------------------
def test_checkout_creates_one_subscription_and_reuses_it(
    user_client: TestClient, razorpay: FakeRazorpay
) -> None:
    first = user_client.post(f"{BILLING}/checkout", json={"interval": "yearly"})
    assert first.status_code == 200, first.text
    again = user_client.post(f"{BILLING}/checkout", json={"interval": "yearly"})
    assert (
        again.json()
        == first.json()
        == {"key_id": KEY_ID, "subscription_id": "sub_1", "interval": "yearly"}
    )
    assert len(razorpay.calls) == 1
    _, path, body = razorpay.calls[0]
    assert path == "/v1/subscriptions"
    assert body["plan_id"] == "plan_yearly" and body["total_count"] == 10
    assert set(body["notes"]) == {"user_id"}
    assert user_client.get(BILLING).json()["plan"] == "free"  # not paid yet


def test_checkout_needs_csrf(user_client: TestClient, razorpay: FakeRazorpay) -> None:
    response = user_client.post(
        f"{BILLING}/checkout", json={"interval": "monthly"}, headers={"x-csrf-token": "wrong"}
    )
    assert response.status_code == 403
    assert razorpay.calls == []


def test_bad_signature_is_refused_and_good_one_turns_pro_on(
    user_client: TestClient, razorpay: FakeRazorpay
) -> None:
    sub_id = user_client.post(f"{BILLING}/checkout", json={"interval": "monthly"}).json()[
        "subscription_id"
    ]
    bad = user_client.post(
        f"{BILLING}/verify",
        json={
            "razorpay_payment_id": "pay_1",
            "razorpay_subscription_id": sub_id,
            "razorpay_signature": "0" * 64,
        },
    )
    assert bad.status_code == 400 and bad.json()["code"] == "PAYMENT_SIGNATURE_INVALID"
    assert user_client.get(BILLING).json()["plan"] == "free"

    good = user_client.post(
        f"{BILLING}/verify",
        json={
            "razorpay_payment_id": "pay_1",
            "razorpay_subscription_id": sub_id,
            "razorpay_signature": payment_signature("pay_1", sub_id, KEY_SECRET),
        },
    )
    assert good.status_code == 200
    assert good.json()["plan"] == "pro" and good.json()["ai_daily_limit"] == 100
    assert good.json()["subscription"]["status"] == "authenticated"
    again = user_client.post(f"{BILLING}/checkout", json={"interval": "yearly"})
    assert again.status_code == 409 and again.json()["code"] == "ALREADY_PRO"


def test_one_user_cannot_verify_anothers_subscription(
    app: FastAPI, user_client: TestClient, razorpay: FakeRazorpay
) -> None:
    sub_id = user_client.post(f"{BILLING}/checkout", json={"interval": "monthly"}).json()[
        "subscription_id"
    ]
    mallory = login_as(app, "mallory@example.com")
    stolen = mallory.post(
        f"{BILLING}/verify",
        json={
            "razorpay_payment_id": "pay_1",
            "razorpay_subscription_id": sub_id,
            "razorpay_signature": payment_signature("pay_1", sub_id, KEY_SECRET),
        },
    )
    assert stolen.status_code == 404
    assert mallory.get(BILLING).json()["plan"] == "free"
    assert user_client.get(BILLING).json()["plan"] == "free"


# ---- webhooks ---------------------------------------------------------------------------------
def test_webhook_needs_a_valid_signature(
    client: TestClient, user_client: TestClient, razorpay: FakeRazorpay
) -> None:
    sub_id = user_client.post(f"{BILLING}/checkout", json={"interval": "monthly"}).json()[
        "subscription_id"
    ]
    raw = _event(sub_id, "active", 1_800_000_000)
    assert _send(client, raw, "evt_1", secret="wrong") == 400
    tampered = raw.replace(b"active", b"halted")
    response = client.post(
        WEBHOOK,
        content=tampered,
        headers={
            "x-razorpay-signature": webhook_signature(raw, WEBHOOK_SECRET),
            "x-razorpay-event-id": "evt_1",
        },
    )
    assert response.status_code == 400
    assert _sub(sub_id).status == "created"
    with get_sessionmaker()() as db:
        assert db.scalar(select(BillingEvent)) is None


def test_webhook_applies_in_order_and_ignores_duplicates(
    client: TestClient, user_client: TestClient, razorpay: FakeRazorpay
) -> None:
    sub_id = _pay(user_client)
    assert _send(client, _event(sub_id, "active", 1_800_000_100), "evt_a") == 200
    assert _sub(sub_id).status == "active" and _sub(sub_id).current_end is not None
    # Same event id again, even with a different body: ignored.
    assert _send(client, _event(sub_id, "halted", 1_800_000_200), "evt_a") == 200
    assert _sub(sub_id).status == "active"
    # An older event arriving late is recorded but not applied.
    assert _send(client, _event(sub_id, "authenticated", 1_800_000_000), "evt_old") == 200
    assert _sub(sub_id).status == "active"
    # A newer one is.
    assert (
        _send(client, _event(sub_id, "halted", 1_800_000_300, "subscription.halted"), "evt_b")
        == 200
    )
    assert _sub(sub_id).status == "halted"
    assert user_client.get(BILLING).json()["plan"] == "free"
    with get_sessionmaker()() as db:
        events = {e.event_id: e.applied for e in db.scalars(select(BillingEvent))}
    assert events == {"evt_a": True, "evt_old": False, "evt_b": True}


def test_webhook_for_an_unknown_subscription_is_kept_and_ignored(
    client: TestClient, razorpay: FakeRazorpay
) -> None:
    assert _send(client, _event("sub_elsewhere", "active", 1_800_000_000), "evt_x") == 200
    with get_sessionmaker()() as db:
        event = db.scalar(select(BillingEvent))
        assert event is not None and event.applied is False
        assert db.scalar(select(Subscription)) is None


def test_webhook_payload_details_are_not_stored() -> None:
    columns = set(BillingEvent.__table__.columns.keys())
    assert not columns & {"payload", "raw", "body", "email", "contact"}


# ---- cancel and account deletion --------------------------------------------------------------
def test_cancel_keeps_pro_until_the_period_ends(
    user_client: TestClient, razorpay: FakeRazorpay
) -> None:
    sub_id = _pay(user_client)
    response = user_client.post(f"{BILLING}/cancel")
    assert response.status_code == 200
    assert response.json()["plan"] == "pro"
    assert response.json()["subscription"]["cancel_at_period_end"] is True
    assert razorpay.calls[-1] == (
        "POST",
        f"/v1/subscriptions/{sub_id}/cancel",
        {"cancel_at_cycle_end": 1},
    )
    user_client.post(f"{BILLING}/cancel")  # idempotent: no second call
    assert len([c for c in razorpay.calls if c[1].endswith("/cancel")]) == 1


def test_deleting_an_account_cancels_pro_first(
    user_client: TestClient, razorpay: FakeRazorpay
) -> None:
    sub_id = _pay(user_client)
    razorpay.fail_with = 500
    failed = user_client.post("/api/v1/account/delete", json={"password": STRONG_PASSWORD})
    assert failed.status_code == 502
    with get_sessionmaker()() as db:
        assert db.scalar(select(User)) is not None  # nothing deleted while billing is still live
    razorpay.fail_with = None
    deleted = user_client.post("/api/v1/account/delete", json={"password": STRONG_PASSWORD})
    assert deleted.status_code == 204
    assert (
        "POST",
        f"/v1/subscriptions/{sub_id}/cancel",
        {"cancel_at_cycle_end": 0},
    ) in razorpay.calls
    with get_sessionmaker()() as db:
        assert db.scalar(select(Subscription)) is None


# ---- plan limits --------------------------------------------------------------------------------
def _rewrite(client: TestClient) -> Callable[[], Any]:
    _, session = _session(client)
    summary = _change(session, "summary")
    url = f"{TAILOR_API}/{session['id']}/changes/{summary['id']}/rewrite"
    return lambda: client.post(url)


def _use_ai(n: int) -> None:
    with get_sessionmaker()() as db:
        owner = db.scalar(select(User.id))
        for _ in range(n):
            db.add(
                AiUsage(
                    owner_id=owner, feature="test", provider="fake", model="fake-1", outcome="ok"
                )
            )
        db.commit()


def test_free_plan_gets_five_ai_requests_then_an_upgrade_prompt(
    user_client: TestClient, razorpay: FakeRazorpay
) -> None:
    usage = user_client.get("/api/v1/ai/usage").json()
    assert (usage["daily_limit"], usage["free_plan"]) == (5, True)
    rewrite = _rewrite(user_client)
    _use_ai(5)
    refused = rewrite()
    assert refused.status_code == 402
    assert refused.json()["code"] == "PLAN_UPGRADE_REQUIRED"


def test_pro_gets_the_full_allowance(user_client: TestClient, razorpay: FakeRazorpay) -> None:
    _pay(user_client)
    usage = user_client.get("/api/v1/ai/usage").json()
    assert (usage["daily_limit"], usage["free_plan"]) == (100, False)
    rewrite = _rewrite(user_client)
    _use_ai(5)
    assert rewrite().status_code == 200


# ---- security review fixes (2026-10-16) -----------------------------------------------------
def test_switching_plans_cancels_the_unpaid_subscription(
    user_client: TestClient, razorpay: FakeRazorpay
) -> None:
    """Only one unpaid subscription is payable at a time, so nobody can pay twice."""
    first = user_client.post(f"{BILLING}/checkout", json={"interval": "monthly"}).json()[
        "subscription_id"
    ]
    second = user_client.post(f"{BILLING}/checkout", json={"interval": "yearly"}).json()[
        "subscription_id"
    ]
    assert second != first
    assert (
        "POST",
        f"/v1/subscriptions/{first}/cancel",
        {"cancel_at_cycle_end": 0},
    ) in razorpay.calls
    assert _sub(first).status == "cancelled"
    created = [body for _, path, body in razorpay.calls if path == "/v1/subscriptions"]
    now = datetime.now(UTC).timestamp()
    assert all(now + 25 * 60 < body["expire_by"] <= now + 31 * 60 for body in created)


def test_an_unpaid_subscription_near_expiry_is_not_reused(
    user_client: TestClient, razorpay: FakeRazorpay
) -> None:
    first = user_client.post(f"{BILLING}/checkout", json={"interval": "monthly"}).json()[
        "subscription_id"
    ]
    with get_sessionmaker()() as db:
        db.execute(
            update(Subscription).values(created_at=datetime.now(UTC) - timedelta(minutes=25))
        )
        db.commit()
    again = user_client.post(f"{BILLING}/checkout", json={"interval": "monthly"}).json()[
        "subscription_id"
    ]
    assert again != first


def test_a_second_payment_is_refused_cleanly(
    user_client: TestClient, razorpay: FakeRazorpay
) -> None:
    _pay(user_client)
    with get_sessionmaker()() as db:
        owner = db.scalar(select(User.id))
        db.add(
            Subscription(
                owner_id=owner,
                provider_subscription_id="sub_stale",
                interval="yearly",
                status="created",
            )
        )
        db.commit()
    response = user_client.post(
        f"{BILLING}/verify",
        json={
            "razorpay_payment_id": "pay_2",
            "razorpay_subscription_id": "sub_stale",
            "razorpay_signature": payment_signature("pay_2", "sub_stale", KEY_SECRET),
        },
    )
    assert response.status_code == 409
    assert response.json()["code"] == "DUPLICATE_PAYMENT"
    with get_sessionmaker()() as db:
        assert db.scalar(select(AuditLog.id).where(AuditLog.action == "billing.duplicate_payment"))


def test_deletion_is_refused_if_pro_cannot_be_cancelled(
    app: FastAPI, settings: Settings, user_client: TestClient, razorpay: FakeRazorpay
) -> None:
    _pay(user_client)
    app.dependency_overrides[get_settings] = lambda: settings  # billing keys removed
    response = user_client.post("/api/v1/account/delete", json={"password": STRONG_PASSWORD})
    assert response.status_code == 503
    assert response.json()["code"] == "BILLING_CANCEL_UNAVAILABLE"
    with get_sessionmaker()() as db:
        assert db.scalar(select(User)) is not None


def test_oversized_webhook_is_refused(client: TestClient, razorpay: FakeRazorpay) -> None:
    raw = b"{" + b" " * (300 * 1024) + b"}"
    assert _send(client, raw, "evt_big") == 413


def test_oddly_shaped_signed_webhook_does_not_crash(
    client: TestClient, razorpay: FakeRazorpay
) -> None:
    raw = json.dumps(
        {"event": "subscription.activated", "payload": ["not", "an", "object"]}
    ).encode()
    assert _send(client, raw, "evt_odd") == 200
