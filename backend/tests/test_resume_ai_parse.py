"""Phase 11: AI-assisted resume import, with every AI value checked against the file."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.ai.provider import LLMCapabilities, LLMMessage, LLMProvider, LLMUsage, StructuredResult
from app.ai.registry import register_provider, unregister_provider
from app.core.config import Settings, get_settings
from app.db.session import get_sessionmaker
from app.models import AiUsage
from app.resumes.ai_parse import AiResume, verify
from tests.conftest import login_as
from tests.fixtures import SAMPLE_TEXT
from tests.test_resumes import API, upload

GOOD: dict[str, Any] = {
    "contact": {
        "full_name": "Priya Raman",
        "email": "priya.raman@example.com",
        "phone": "+91-98765-43210",  # punctuation differs; digits match
        "location": "Bengaluru, India",
    },
    "summary": "Backend engineer with 6 years of experience building data-heavy Python "
    "services and APIs.",
    "experience": [
        {
            "title": "Senior Software Engineer",
            "company": "Acme Analytics",
            "start_date": "Jan 2021",
            "end_date": "Present",
            "current": True,
            "bullets": [
                "Led migration of the reporting pipeline to PostgreSQL, cutting query "
                "latency by 40%.",
                "Mentored a team of 12 engineers.",  # invented
            ],
        },
        {"title": "Staff Engineer", "company": "Globex"},  # invented role, dropped entirely
    ],
    "skills": [{"name": "Python"}, {"name": "Rust"}],
}


class _Parser(LLMProvider):
    name = "fake"
    answer: dict[str, Any] = GOOD
    seen: list[LLMMessage] = []

    @property
    def model(self) -> str:
        return "fake-1"

    @property
    def capabilities(self) -> LLMCapabilities:
        return LLMCapabilities(structured_output=True)

    def generate_structured(self, schema, messages, *, max_output_tokens=None):  # type: ignore[no-untyped-def]
        _Parser.seen = messages
        return StructuredResult(
            parsed=schema.model_validate(_Parser.answer),
            usage=LLMUsage(input_tokens=900, output_tokens=300),
            provider="fake",
            model="fake-1",
            latency_ms=1.0,
        )


@pytest.fixture
def fake_ai(app: FastAPI, settings: Settings) -> Iterator[None]:
    register_provider("fake", lambda s: _Parser())
    app.dependency_overrides[get_settings] = lambda: settings.model_copy(
        update={"llm_provider": "fake", "llm_model": "fake-1"}
    )
    yield
    unregister_provider("fake")
    _Parser.answer = GOOD


def _import(client: TestClient) -> dict[str, Any]:
    response = upload(client, "resume.txt", SAMPLE_TEXT.encode(), "text/plain")
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return body


# ---- unit ------------------------------------------------------------------------------
def test_verify_keeps_only_values_found_in_the_file() -> None:
    content, kept, dropped = verify(AiResume.model_validate(GOOD), SAMPLE_TEXT)
    assert content.contact.full_name == "Priya Raman"
    assert content.contact.phone == "+91-98765-43210"
    assert [e.company for e in content.experience] == ["Acme Analytics"]
    assert content.experience[0].current is True
    assert content.experience[0].bullets == [GOOD["experience"][0]["bullets"][0]]
    assert [s.name for s in content.skills] == ["Python"]
    assert "Bullet: “Mentored a team of 12 engineers.”" in dropped
    assert "Company: “Globex”" in dropped and "Skill: “Rust”" in dropped
    assert kept >= 10
    assert len({e.id for e in content.experience}) == len(content.experience)  # fresh ids


# ---- API -------------------------------------------------------------------------------
def test_ai_parse_needs_a_configured_provider(user_client: TestClient) -> None:
    item = _import(user_client)
    assert item["ai_available"] is False
    response = user_client.post(f"{API}/imports/{item['id']}/ai-parse")
    assert response.status_code == 503
    assert response.json()["code"] == "AI_PROVIDER_NOT_CONFIGURED"
    assert user_client.get(f"{API}/imports/{item['id']}").json()["content"] == item["content"]


def test_ai_parse_replaces_the_draft_and_can_be_undone(
    user_client: TestClient, fake_ai: None
) -> None:
    item = _import(user_client)
    assert item["ai_available"] is True
    response = user_client.post(f"{API}/imports/{item['id']}/ai-parse")
    assert response.status_code == 200, response.text
    body = response.json()
    ai = body["report"]["ai"]
    assert ai["provider"] == "fake" and ai["method_version"] == "resume-ai-v1"
    assert "Bullet: “Mentored a team of 12 engineers.”" in ai["dropped"]
    assert [s["name"] for s in body["content"]["skills"]] == ["Python"]
    assert "rules_parsed" not in body["report"]
    # The file text is sent as data, never in the system prompt.
    system = [m for m in _Parser.seen if m.role == "system"]
    assert len(system) == 1 and "Priya" not in system[0].content
    assert any("Priya Raman" in m.content for m in _Parser.seen if m.role == "user")
    with get_sessionmaker()() as db:
        assert [u.feature for u in db.scalars(select(AiUsage))] == ["resumes.ai_parse"]

    undone = user_client.delete(f"{API}/imports/{item['id']}/ai-parse")
    assert undone.status_code == 200
    assert undone.json()["content"] == item["content"]
    assert undone.json()["report"]["ai"] is None


def test_confirm_saves_the_ai_version(user_client: TestClient, fake_ai: None) -> None:
    item = _import(user_client)
    body = user_client.post(f"{API}/imports/{item['id']}/ai-parse").json()
    confirmed = user_client.post(
        f"{API}/imports/{item['id']}/confirm", json={"content": body["content"]}
    )
    assert confirmed.status_code == 201, confirmed.text
    assert [s["name"] for s in confirmed.json()["content"]["skills"]] == ["Python"]
    again = user_client.post(f"{API}/imports/{item['id']}/ai-parse")
    assert again.status_code == 409


def test_an_answer_with_nothing_from_the_file_is_refused(
    user_client: TestClient, fake_ai: None
) -> None:
    item = _import(user_client)
    _Parser.answer = {"contact": {"full_name": "John Doe"}, "skills": [{"name": "COBOL"}]}
    response = user_client.post(f"{API}/imports/{item['id']}/ai-parse")
    assert response.status_code == 422
    assert response.json()["code"] == "AI_PARSE_EMPTY"
    assert user_client.get(f"{API}/imports/{item['id']}").json()["content"] == item["content"]


def test_other_users_cannot_ai_parse(app: FastAPI, user_client: TestClient, fake_ai: None) -> None:
    item = _import(user_client)
    other = login_as(app, "mallory@example.com")
    assert other.post(f"{API}/imports/{item['id']}/ai-parse").status_code == 404
    assert other.delete(f"{API}/imports/{item['id']}/ai-parse").status_code == 404
