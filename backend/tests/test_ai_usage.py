"""Phase 10: every AI call is recorded and capped per user per day."""

from __future__ import annotations

from collections.abc import Callable, Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.ai.registry import register_provider, unregister_provider
from app.core.config import Settings, get_settings
from app.db.session import get_sessionmaker
from app.models import AiUsage
from tests.conftest import login_as
from tests.test_claims import _Stub
from tests.test_tailoring import API, _change, _session

USAGE = "/api/v1/ai/usage"


@pytest.fixture
def ai_with_limit(app: FastAPI, settings: Settings) -> Iterator[Callable[[int], None]]:
    register_provider("fake", lambda s: _Stub())

    def set_limit(limit: int) -> None:
        app.dependency_overrides[get_settings] = lambda: settings.model_copy(
            update={
                "llm_provider": "fake",
                "llm_model": "fake-1",
                "ai_daily_limit_per_user": limit,
            }
        )

    set_limit(100)
    yield set_limit
    unregister_provider("fake")


def _rows() -> list[AiUsage]:
    with get_sessionmaker()() as db:
        return list(db.scalars(select(AiUsage).order_by(AiUsage.created_at)))


def test_usage_starts_at_zero(user_client: TestClient) -> None:
    body = user_client.get(USAGE).json()
    assert body["used_today"] == 0 and body["daily_limit"] == 100 and body["remaining"] == 100
    assert body["resets_at"].endswith(("+00:00", "Z")) and "T00:00:00" in body["resets_at"]


def test_every_call_is_recorded_without_text(
    user_client: TestClient, ai_with_limit: Callable[[int], None]
) -> None:
    _, session = _session(user_client)
    summary = _change(session, "summary")
    response = user_client.post(f"{API}/{session['id']}/changes/{summary['id']}/rewrite")
    assert response.status_code == 200, response.text
    rows = _rows()
    assert [(r.feature, r.outcome, r.provider, r.model) for r in rows] == [
        ("tailoring.rewrite", "ok", "fake", "fake-1"),
        ("tailoring.claims", "ok", "fake", "fake-1"),
    ]
    columns = set(AiUsage.__table__.columns.keys())
    assert not columns & {"prompt", "text", "content", "answer"}
    assert user_client.get(USAGE).json()["used_today"] == 2


def test_failed_calls_are_recorded_too(
    user_client: TestClient, ai_with_limit: Callable[[int], None]
) -> None:
    _, session = _session(user_client)
    summary = _change(session, "summary")
    _Stub.fail_claims = True
    user_client.post(f"{API}/{session['id']}/changes/{summary['id']}/rewrite")
    assert [(r.feature, r.outcome, r.error_code) for r in _rows()] == [
        ("tailoring.rewrite", "ok", None),
        ("tailoring.claims", "error", "AI_PROVIDER_FAILED"),
    ]


def test_daily_limit_blocks_further_calls(
    user_client: TestClient, ai_with_limit: Callable[[int], None]
) -> None:
    ai_with_limit(1)
    _, session = _session(user_client)
    summary = _change(session, "summary")
    url = f"{API}/{session['id']}/changes/{summary['id']}/rewrite"
    first = user_client.post(url)
    assert first.status_code == 200, first.text
    # The rewrite used the last call, so the claim check says it could not run.
    flags = _change(first.json(), "summary")["flags"]
    assert any("could not run" in f["message"] for f in flags)
    second = user_client.post(url)
    assert second.status_code == 429
    assert second.json()["code"] == "AI_DAILY_LIMIT_REACHED"
    assert user_client.get(USAGE).json() | {"resets_at": None} == {
        "used_today": 1,
        "daily_limit": 1,
        "remaining": 0,
        "resets_at": None,
    }
    # Refused calls are not sent to the provider and not counted.
    assert len(_rows()) == 1


def test_limits_are_per_user_and_zero_means_none(
    app: FastAPI, user_client: TestClient, ai_with_limit: Callable[[int], None]
) -> None:
    ai_with_limit(1)
    _, session = _session(user_client)
    summary = _change(session, "summary")
    user_client.post(f"{API}/{session['id']}/changes/{summary['id']}/rewrite")
    other = login_as(app, "mallory@example.com")
    assert other.get(USAGE).json()["used_today"] == 0
    ai_with_limit(0)
    body = user_client.get(USAGE).json()
    assert body["daily_limit"] == 0 and body["remaining"] is None
    again = user_client.post(f"{API}/{session['id']}/changes/{summary['id']}/rewrite")
    assert again.status_code == 200, again.text
