from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select, text, update

from app.core.config import Settings, get_settings
from app.core.security import hash_password, verify_password
from app.db.session import get_sessionmaker
from app.main import create_app
from app.models import AuditLog, User, UserSession
from tests.conftest import STRONG_PASSWORD, register


def test_register_creates_user_session_cookie_and_audit(client: TestClient) -> None:
    response = register(client)
    assert response.status_code == 201
    body = response.json()
    assert body["user"]["email"] == "ada@example.com"
    assert "password" not in response.text and "password_hash" not in response.text
    assert body["csrf_token"]

    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie

    with get_sessionmaker()() as db:
        user = db.scalar(select(User))
        assert user is not None
        assert user.password_hash.startswith("$argon2id$")
        assert STRONG_PASSWORD not in user.password_hash
        raw = response.cookies.get("ri_session")
        assert raw and db.scalar(select(UserSession).where(UserSession.token_hash == raw)) is None
        actions = [a.action for a in db.scalars(select(AuditLog))]
        assert "auth.register" in actions


def test_register_normalizes_email_and_rejects_duplicates_case_insensitively(
    client: TestClient,
) -> None:
    assert register(client, "Ada@Example.COM").status_code == 201
    dup = register(client, "ada@example.com")
    assert dup.status_code == 409
    assert dup.json()["code"] == "EMAIL_ALREADY_REGISTERED"


def test_register_rejects_short_password(client: TestClient) -> None:
    response = register(client, password="short")
    assert response.status_code == 422
    assert response.json()["code"] == "WEAK_PASSWORD"
    assert "short" not in response.json()["details"][0]["message"].lower().replace("too short", "")


def test_register_can_be_disabled(settings: Settings, client: TestClient, app) -> None:  # type: ignore[no-untyped-def]
    app.dependency_overrides[get_settings] = lambda: settings.model_copy(
        update={"registration_enabled": False}
    )
    response = register(client)
    assert response.status_code == 403
    assert response.json()["code"] == "REGISTRATION_DISABLED"


def test_login_success_and_me(client: TestClient) -> None:
    register(client)
    client.cookies.clear()
    response = client.post(
        "/api/v1/auth/login", json={"email": "ADA@example.com", "password": STRONG_PASSWORD}
    )
    assert response.status_code == 200
    me = client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["user"]["display_name"] == "Ada Lovelace"
    assert me.json()["csrf_token"] == response.json()["csrf_token"]


def test_login_failure_is_generic_for_unknown_and_wrong_password(client: TestClient) -> None:
    register(client)
    client.cookies.clear()
    wrong = client.post("/api/v1/auth/login", json={"email": "ada@example.com", "password": "nope"})
    unknown = client.post(
        "/api/v1/auth/login", json={"email": "who@example.com", "password": "nope"}
    )
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json()["code"] == unknown.json()["code"] == "INVALID_CREDENTIALS"
    assert wrong.json()["message"] == unknown.json()["message"]
    with get_sessionmaker()() as db:
        failures = list(db.scalars(select(AuditLog).where(AuditLog.outcome == "failure")))
        assert len(failures) == 2
        assert all("ada@example.com" not in str(f.details) for f in failures)


def test_inactive_user_cannot_login(client: TestClient) -> None:
    register(client)
    client.cookies.clear()
    with get_sessionmaker()() as db:
        db.execute(update(User).values(is_active=False))
        db.commit()
    response = client.post(
        "/api/v1/auth/login", json={"email": "ada@example.com", "password": STRONG_PASSWORD}
    )
    assert response.status_code == 401


def test_protected_route_requires_auth(client: TestClient) -> None:
    for path in ("/api/v1/auth/me", "/api/v1/system/capabilities"):
        response = client.get(path)
        assert response.status_code == 401
        assert response.json()["code"] == "AUTH_REQUIRED"


def test_logout_requires_csrf_then_destroys_session(auth_client: TestClient) -> None:
    missing = auth_client.post("/api/v1/auth/logout")
    assert missing.status_code == 403 and missing.json()["code"] == "CSRF_INVALID"
    wrong = auth_client.post("/api/v1/auth/logout", headers={"x-csrf-token": "wrong"})
    assert wrong.status_code == 403

    ok = auth_client.post("/api/v1/auth/logout", headers={"x-csrf-token": auth_client.csrf})  # type: ignore[attr-defined]
    assert ok.status_code == 204
    assert auth_client.get("/api/v1/auth/me").status_code == 401
    with get_sessionmaker()() as db:
        assert db.scalar(select(UserSession)) is None


def test_stolen_cookie_value_after_logout_is_useless(auth_client: TestClient) -> None:
    cookie = auth_client.cookies.get("ri_session")
    auth_client.post("/api/v1/auth/logout", headers={"x-csrf-token": auth_client.csrf})  # type: ignore[attr-defined]
    auth_client.cookies.set("ri_session", cookie or "")
    assert auth_client.get("/api/v1/auth/me").status_code == 401


def test_forged_session_cookie_rejected(client: TestClient) -> None:
    client.cookies.set("ri_session", "A" * 43)
    assert client.get("/api/v1/auth/me").status_code == 401


def test_absolute_session_expiry(auth_client: TestClient) -> None:
    with get_sessionmaker()() as db:
        db.execute(update(UserSession).values(expires_at=datetime.now(UTC) - timedelta(seconds=1)))
        db.commit()
    assert auth_client.get("/api/v1/auth/me").status_code == 401


def test_idle_session_expiry(auth_client: TestClient) -> None:
    with get_sessionmaker()() as db:
        db.execute(update(UserSession).values(last_seen_at=datetime.now(UTC) - timedelta(hours=25)))
        db.commit()
    assert auth_client.get("/api/v1/auth/me").status_code == 401


def test_login_rate_limited(settings: Settings, app, client: TestClient) -> None:  # type: ignore[no-untyped-def]
    app.dependency_overrides[get_settings] = lambda: settings.model_copy(
        update={"auth_rate_limit_attempts": 3}
    )
    register(client)
    client.cookies.clear()
    codes = [
        client.post(
            "/api/v1/auth/login", json={"email": "ada@example.com", "password": "bad-password"}
        ).status_code
        for _ in range(5)
    ]
    assert codes[:3] == [401, 401, 401]
    assert codes[3:] == [429, 429]


def test_sql_injection_in_email_is_inert(client: TestClient) -> None:
    register(client)
    client.cookies.clear()
    response = client.post(
        "/api/v1/auth/login", json={"email": "x@example.com' OR '1'='1", "password": "whatever"}
    )
    assert response.status_code == 422  # not a valid email, and never reaches SQL
    with get_sessionmaker()() as db:
        assert db.execute(text("select count(*) from users")).scalar_one() == 1


def test_password_hash_roundtrip_and_dummy_verification() -> None:
    hashed = hash_password("a-long-enough-password")
    assert verify_password(hashed, "a-long-enough-password")
    assert not verify_password(hashed, "other")
    assert not verify_password(None, "not-a-real-password")  # dummy hash must never authenticate


def test_app_factory_independent(settings: Settings) -> None:
    assert create_app(settings) is not create_app(settings)


def test_login_purges_expired_sessions(client: TestClient) -> None:
    register(client)
    with get_sessionmaker()() as db:
        db.execute(update(UserSession).values(expires_at=datetime.now(UTC) - timedelta(days=1)))
        db.commit()
    client.cookies.clear()
    response = client.post(
        "/api/v1/auth/login", json={"email": "ada@example.com", "password": STRONG_PASSWORD}
    )
    assert response.status_code == 200
    with get_sessionmaker()() as db:
        sessions = list(db.scalars(select(UserSession)))
        assert len(sessions) == 1 and sessions[0].expires_at > datetime.now(UTC)
