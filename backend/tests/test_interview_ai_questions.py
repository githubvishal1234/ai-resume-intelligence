"""Phase 13: AI interview questions next to the rule-based bank."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.ai.provider import LLMCapabilities, LLMMessage, LLMProvider, LLMUsage, StructuredResult
from app.ai.registry import register_provider, unregister_provider
from app.core.config import Settings, get_settings
from tests.conftest import login_as
from tests.test_interview import API, _prep, _start


def _answer(prep: dict[str, Any]) -> dict[str, Any]:
    req = prep["questions"][1]["requirement_ids"] or ["nope"]
    return {
        "questions": [
            {
                "category": "technical",
                "text": "How would you tune a slow PostgreSQL query in production?",
                "why": "The posting asks for query optimization.",
                "tips": ["Walk through EXPLAIN, indexes and the 40% latency cut you made."],
                "requirement_ids": [req[0], "made-up-id"],
            },
            {
                "category": "behavioral",
                "text": "Tell me about mentoring a junior engineer.",
                "why": "The role includes mentoring.",
                "tips": [],
            },
            {  # invents a number the resume and posting do not have
                "category": "experience",
                "text": "You grew revenue by 300%. How?",
                "why": "Big results stand out.",
            },
            {  # duplicates the rule bank's opening question
                "category": "role",
                "text": prep["questions"][0]["text"],
            },
        ]
    }


class _Interviewer(LLMProvider):
    name = "fake"
    answer: dict[str, Any] = {"questions": []}
    seen: list[LLMMessage] = []

    @property
    def model(self) -> str:
        return "fake-1"

    @property
    def capabilities(self) -> LLMCapabilities:
        return LLMCapabilities(structured_output=True)

    def generate_structured(self, schema, messages, *, max_output_tokens=None):  # type: ignore[no-untyped-def]
        _Interviewer.seen = messages
        return StructuredResult(
            parsed=schema.model_validate(_Interviewer.answer),
            usage=LLMUsage(),
            provider="fake",
            model="fake-1",
            latency_ms=1.0,
        )


@pytest.fixture
def fake_ai(app: FastAPI, settings: Settings) -> Iterator[None]:
    register_provider("fake", lambda s: _Interviewer())
    app.dependency_overrides[get_settings] = lambda: settings.model_copy(
        update={"llm_provider": "fake", "llm_model": "fake-1"}
    )
    yield
    unregister_provider("fake")


def test_ai_questions_need_a_configured_provider(user_client: TestClient) -> None:
    prep = _prep(user_client)
    response = user_client.post(f"{API}/preps/{prep['id']}/ai-questions")
    assert response.status_code == 503
    assert response.json()["code"] == "AI_PROVIDER_NOT_CONFIGURED"


def test_ai_questions_are_added_marked_and_checked(user_client: TestClient, fake_ai: None) -> None:
    prep = _prep(user_client)
    session = _start(user_client, prep)
    _Interviewer.answer = _answer(prep)
    response = user_client.post(f"{API}/preps/{prep['id']}/ai-questions")
    assert response.status_code == 200, response.text
    body = response.json()
    ai = [q for q in body["questions"] if q["source"] == "ai"]
    assert [q["text"] for q in ai] == [
        "How would you tune a slow PostgreSQL query in production?",
        "Tell me about mentoring a junior engineer.",
    ]
    assert "made-up-id" not in ai[0]["requirement_ids"]
    # The rule bank and earlier practice are untouched.
    rules = [q for q in body["questions"] if q["source"] == "rules"]
    assert [q["id"] for q in rules] == [q["id"] for q in prep["questions"]]
    assert len(body["questions"]) == len(prep["questions"]) + 2
    assert user_client.get(f"/api/v1/interview/sessions/{session['id']}").status_code == 200
    # Resume and job text are data, never in the system prompt.
    system = [m for m in _Interviewer.seen if m.role == "system"]
    assert len(system) == 1 and "Priya" not in system[0].content

    # The new questions can be practiced.
    started = _start(user_client, body, question_ids=[ai[0]["id"]])
    assert [q["id"] for q in started["questions"]] == [ai[0]["id"]]

    # Asking again with the same suggestions adds nothing.
    again = user_client.post(f"{API}/preps/{prep['id']}/ai-questions")
    assert again.status_code == 422 and again.json()["code"] == "NO_NEW_AI_QUESTIONS"


def test_ai_questions_are_capped(user_client: TestClient, fake_ai: None) -> None:
    prep = _prep(user_client)
    url = f"{API}/preps/{prep['id']}/ai-questions"
    words = ["alpha", "beta", "gamma", "delta", "epsilon"]
    for batch in words[:4]:
        _Interviewer.answer = {
            "questions": [
                {"category": "technical", "text": f"Question {batch} {w} about your APIs?"}
                for w in words
            ]
        }
        assert user_client.post(url).status_code == 200
    blocked = user_client.post(url)
    assert blocked.status_code == 409 and blocked.json()["code"] == "AI_QUESTION_LIMIT"


def test_other_users_cannot_add_ai_questions(
    app: FastAPI, user_client: TestClient, fake_ai: None
) -> None:
    prep = _prep(user_client)
    other = login_as(app, "mallory@example.com")
    assert other.post(f"{API}/preps/{prep['id']}/ai-questions").status_code == 404
