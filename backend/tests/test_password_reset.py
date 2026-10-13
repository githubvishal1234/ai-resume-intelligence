from __future__ import annotations

import re
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import text

from app.core.config import Settings, get_settings
from app.db.session import get_engine
from app.mail.base import EmailSendFailed, email_status, get_email_sender
from tests.conftest import STRONG_PASSWORD
from tests.fake_smtp import FakeSmtp

NEW_PASSWORD = "a-brand-new-passphrase"


@pytest.fixture
def smtp() -> Iterator[FakeSmtp]:
    server = FakeSmtp()
    yield server
    server.close()


def _smtp_settings(settings: Settings, smtp: FakeSmtp, **extra: object) -> Settings:
    return settings.model_copy(
        update={
            "email_provider": "smtp",
            "email_from": "Resumes <no-reply@example.com>",
            "app_base_url": "https://app.example.com/",
            "smtp_host": "127.0.0.1",
            "smtp_port": smtp.port,
            "smtp_security": "none",
            **extra,
        }
    )


@pytest.fixture
def mail_app(app, settings: Settings, smtp: FakeSmtp):  # type: ignore[no-untyped-def]
    configured = _smtp_settings(settings, smtp)
    app.dependency_overrides[get_settings] = lambda: configured
    return app


def _link_token(smtp: FakeSmtp) -> str:
    body = smtp.messages[-1].get_payload(decode=True).decode()  # type: ignore[union-attr]
    match = re.search(r"https://app\.example\.com/reset-password\?token=(\S+)", body)
    assert match, body
    return match.group(1)


def test_email_status_names_missing_settings(settings: Settings, smtp: FakeSmtp) -> None:
    assert email_status(settings).reason == "EMAIL_PROVIDER is not set."
    partial = settings.model_copy(update={"email_provider": "smtp"})
    status = email_status(partial)
    assert (
        not status.configured
        and status.reason == "EMAIL_FROM, APP_BASE_URL, SMTP_HOST must be set."
    )
    assert email_status(_smtp_settings(settings, smtp)).configured


def test_smtp_sender_sends_and_logs_in(settings: Settings, smtp: FakeSmtp) -> None:
    s = _smtp_settings(settings, smtp, smtp_username="mailer", smtp_password=SecretStr("s3cret"))
    get_email_sender(s).send(
        "ada@example.com",
        "password_reset",
        {"display_name": "Ada", "link": "https://x/reset", "ttl_minutes": 30},
    )
    message = smtp.messages[0]
    assert message["To"] == "ada@example.com"
    assert message["Subject"] == "Reset your AI Resume Intelligence password"
    assert "within 30 minutes" in message.get_payload(decode=True).decode()  # type: ignore[union-attr]
    assert smtp.logins == [("mailer", "s3cret")]


def test_smtp_failure_is_reported_without_details(settings: Settings, smtp: FakeSmtp) -> None:
    smtp.fail = True
    with pytest.raises(EmailSendFailed):
        get_email_sender(_smtp_settings(settings, smtp)).send(
            "ada@example.com",
            "password_reset",
            {"display_name": "A", "link": "l", "ttl_minutes": 5},
        )


def test_console_sender_refused_in_production() -> None:
    with pytest.raises(ValueError, match="development only"):
        Settings(
            app_env="production",
            database_url="postgresql+psycopg://u:strong@db/x",
            session_cookie_secure=True,
            email_provider="console",
        )


def test_reset_is_hidden_and_refused_without_email(client: TestClient) -> None:
    assert client.get("/api/v1/auth/options").json() == {
        "registration": True,
        "password_reset": False,
    }
    response = client.post("/api/v1/auth/password-reset/request", json={"email": "a@example.com"})
    assert response.status_code == 503 and response.json()["code"] == "EMAIL_NOT_CONFIGURED"


def test_full_reset_flow(mail_app, smtp: FakeSmtp) -> None:  # type: ignore[no-untyped-def]
    browser = TestClient(mail_app, raise_server_exceptions=False)
    assert browser.get("/api/v1/auth/options").json()["password_reset"] is True
    signup = browser.post(
        "/api/v1/auth/register",
        json={"email": "ada@example.com", "password": STRONG_PASSWORD, "display_name": "Ada"},
    )
    assert signup.status_code == 201

    unknown = browser.post(
        "/api/v1/auth/password-reset/request", json={"email": "nobody@example.com"}
    )
    known = browser.post("/api/v1/auth/password-reset/request", json={"email": "ADA@example.com"})
    assert unknown.status_code == known.status_code == 202
    assert unknown.json() == known.json() == {}
    assert len(smtp.messages) == 1 and smtp.messages[0]["To"] == "ada@example.com"
    token = _link_token(smtp)
    with get_engine().connect() as conn:
        stored = conn.scalar(text("select token_hash from password_reset_tokens"))
    assert stored and token not in stored

    fresh = TestClient(mail_app, raise_server_exceptions=False)
    weak = fresh.post(
        "/api/v1/auth/password-reset/confirm", json={"token": token, "new_password": "short"}
    )
    assert weak.json()["code"] == "WEAK_PASSWORD"
    done = fresh.post(
        "/api/v1/auth/password-reset/confirm", json={"token": token, "new_password": NEW_PASSWORD}
    )
    assert done.status_code == 204
    assert browser.get("/api/v1/auth/me").status_code == 401  # every browser signed out
    again = fresh.post(
        "/api/v1/auth/password-reset/confirm", json={"token": token, "new_password": NEW_PASSWORD}
    )
    assert again.status_code == 400 and again.json()["code"] == "RESET_LINK_INVALID"

    def sign_in(password: str) -> int:
        body = {"email": "ada@example.com", "password": password}
        return fresh.post("/api/v1/auth/login", json=body).status_code

    assert sign_in(STRONG_PASSWORD) == 401
    assert sign_in(NEW_PASSWORD) == 200


def test_new_request_replaces_old_link_and_links_expire(mail_app, smtp: FakeSmtp) -> None:  # type: ignore[no-untyped-def]
    c = TestClient(mail_app, raise_server_exceptions=False)
    c.post(
        "/api/v1/auth/register",
        json={"email": "ada@example.com", "password": STRONG_PASSWORD, "display_name": "Ada"},
    )
    c.post("/api/v1/auth/password-reset/request", json={"email": "ada@example.com"})
    first = _link_token(smtp)
    c.post("/api/v1/auth/password-reset/request", json={"email": "ada@example.com"})
    second = _link_token(smtp)
    old = c.post(
        "/api/v1/auth/password-reset/confirm", json={"token": first, "new_password": NEW_PASSWORD}
    )
    assert old.json()["code"] == "RESET_LINK_INVALID"
    with get_engine().begin() as conn:
        conn.execute(
            text("update password_reset_tokens set expires_at = :t"),
            {"t": datetime.now(UTC) - timedelta(seconds=1)},
        )
    expired = c.post(
        "/api/v1/auth/password-reset/confirm", json={"token": second, "new_password": NEW_PASSWORD}
    )
    assert expired.json()["code"] == "RESET_LINK_INVALID"


def test_send_failure_gives_the_same_answer(mail_app, smtp: FakeSmtp) -> None:  # type: ignore[no-untyped-def]
    c = TestClient(mail_app, raise_server_exceptions=False)
    c.post(
        "/api/v1/auth/register",
        json={"email": "ada@example.com", "password": STRONG_PASSWORD, "display_name": "Ada"},
    )
    smtp.fail = True
    response = c.post("/api/v1/auth/password-reset/request", json={"email": "ada@example.com"})
    assert response.status_code == 202 and response.json() == {}
    with get_engine().connect() as conn:
        assert conn.scalar(text("select count(*) from password_reset_tokens")) == 0
        reason = conn.scalar(
            text(
                "select details->>'reason' from audit_logs"
                " where action = 'auth.password_reset_requested'"
            )
        )
    assert reason == "send_failed"
