from __future__ import annotations

from collections.abc import Iterator
from datetime import date
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.ai.provider import LLMCapabilities, LLMMessage, LLMProvider, LLMUsage, StructuredResult
from app.ai.registry import register_provider, unregister_provider
from app.core.config import Settings, get_settings
from app.interview.questions import build_questions
from app.jobs.analyzer import analyze_job
from app.matching.matcher import match
from app.resumes.parser import parse_resume
from tests.conftest import login_as
from tests.fixtures import SAMPLE_TEXT
from tests.test_jobs import JD
from tests.test_jobs import create as create_job
from tests.test_resumes import import_and_confirm

API = "/api/v1/interview"


def _questions():  # type: ignore[no-untyped-def]
    resume = parse_resume(SAMPLE_TEXT).content
    job = analyze_job(JD)
    return resume, build_questions(
        resume,
        job,
        match(resume, job, date(2026, 10, 12)),
        title="Backend Engineer",
        company="Acme",
    )


def _prep(client: TestClient) -> dict[str, Any]:
    import_and_confirm(client)
    job = create_job(client, company="Acme").json()
    response = client.post(f"{API}/preps", json={"job_id": job["id"]})
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return body


def _start(client: TestClient, prep: dict[str, Any], **body: Any) -> dict[str, Any]:
    response = client.post(f"{API}/preps/{prep['id']}/sessions", json=body)
    assert response.status_code == 201, response.text
    result: dict[str, Any] = response.json()
    return result


# ---- question bank ---------------------------------------------------------------------
def test_questions_cover_every_source_and_quote_only_the_resume() -> None:
    resume, questions = _questions()
    categories = {q.category for q in questions}
    assert categories == {"opening", "experience", "technical", "gap", "role", "behavioral"}
    resume_text = str(resume.model_dump())
    for q in questions:
        assert q.why and q.tips
        for e in q.evidence:
            # Evidence is quoted (date ranges are joined from start and end), never invented.
            assert all(part in resume_text for part in e.excerpt[:60].split(" – "))
    gap = next(q for q in questions if q.category == "gap")
    assert any("Don't claim" in t for t in gap.tips)


def test_question_ids_are_stable_and_unique() -> None:
    _, first = _questions()
    _, second = _questions()
    assert [q.id for q in first] == [q.id for q in second]
    assert len({q.id for q in first}) == len(first)


# ---- API -------------------------------------------------------------------------------
def test_prep_uses_master_and_lists(user_client: TestClient) -> None:
    prep = _prep(user_client)
    assert prep["method_version"] == "interview-rules-v1"
    assert prep["resume_version"] == 1 and prep["company"] == "Acme"
    assert prep["question_count"] == len(prep["questions"]) > 5
    listed = user_client.get(f"{API}/preps").json()
    assert [p["id"] for p in listed] == [prep["id"]]


def test_prep_needs_a_master_resume(user_client: TestClient) -> None:
    job = create_job(user_client).json()
    response = user_client.post(f"{API}/preps", json={"job_id": job["id"]})
    assert response.status_code == 422
    assert response.json()["code"] == "MASTER_RESUME_REQUIRED"


def test_practice_flow_saves_answers_and_completes(user_client: TestClient) -> None:
    prep = _prep(user_client)
    picked = [q["id"] for q in prep["questions"][:2]]
    session = _start(user_client, prep, question_ids=picked)
    assert [q["id"] for q in session["questions"]] == picked
    url = f"{API}/sessions/{session['id']}/answers/{picked[0]}"
    saved = user_client.put(url, json={"answer": " I led the migration. ", "self_rating": 4})
    body = saved.json()
    assert body["answered_count"] == 1 and body["average_rating"] == 4.0
    assert body["answers"][0]["answer"] == "I led the migration."
    again = user_client.put(
        url, json={"answer": "I led it.", "self_rating": 2, "notes": "Add numbers"}
    )
    assert (
        len(again.json()["answers"]) == 1 and again.json()["answers"][0]["notes"] == "Add numbers"
    )
    other = prep["questions"][-1]["id"]
    outside = user_client.put(
        f"{API}/sessions/{session['id']}/answers/{other}", json={"answer": "x"}
    )
    assert outside.status_code == 422 and outside.json()["code"] == "QUESTION_NOT_IN_SESSION"
    assert user_client.put(url, json={"self_rating": 6}).status_code == 422

    done = user_client.post(f"{API}/sessions/{session['id']}/complete").json()
    assert done["status"] == "completed" and done["completed_at"]
    late = user_client.put(url, json={"answer": "late"})
    assert late.status_code == 409 and late.json()["code"] == "PRACTICE_SESSION_COMPLETED"
    summary = user_client.get(f"{API}/preps/{prep['id']}").json()["sessions"][0]
    assert summary["answered_count"] == 1 and summary["question_count"] == 2


def test_unknown_questions_are_refused_when_starting(user_client: TestClient) -> None:
    prep = _prep(user_client)
    response = user_client.post(
        f"{API}/preps/{prep['id']}/sessions", json={"question_ids": ["0123456789ab"]}
    )
    assert response.status_code == 422


def test_evaluation_needs_an_ai_provider(user_client: TestClient) -> None:
    prep = _prep(user_client)
    session = _start(user_client, prep)
    qid = session["questions"][0]["id"]
    url = f"{API}/sessions/{session['id']}/answers/{qid}"
    empty = user_client.post(f"{url}/evaluate")
    assert empty.status_code == 422 and empty.json()["code"] == "ANSWER_REQUIRED"
    user_client.put(url, json={"answer": "I built data platforms."})
    response = user_client.post(f"{url}/evaluate")
    assert response.status_code == 503
    assert response.json()["code"] == "AI_PROVIDER_NOT_CONFIGURED"


class _FakeCoach(LLMProvider):
    name = "fake"
    seen: list[LLMMessage] = []

    @property
    def model(self) -> str:
        return "fake-1"

    @property
    def capabilities(self) -> LLMCapabilities:
        return LLMCapabilities(structured_output=True)

    def generate_structured(self, schema, messages, *, max_output_tokens=None):  # type: ignore[no-untyped-def]
        _FakeCoach.seen = messages
        parsed = schema(score=3, strengths=["Clear structure."], improvements=["Add the result."])
        return StructuredResult(
            parsed=parsed, usage=LLMUsage(), provider="fake", model="fake-1", latency_ms=1.0
        )


@pytest.fixture
def fake_ai(app: FastAPI, settings: Settings) -> Iterator[None]:
    register_provider("fake", lambda s: _FakeCoach())
    app.dependency_overrides[get_settings] = lambda: settings.model_copy(
        update={"llm_provider": "fake", "llm_model": "fake-1"}
    )
    yield
    unregister_provider("fake")


def test_evaluation_with_a_provider_keeps_the_answer_out_of_the_system_prompt(
    user_client: TestClient, fake_ai: None
) -> None:
    prep = _prep(user_client)
    session = _start(user_client, prep)
    qid = session["questions"][0]["id"]
    url = f"{API}/sessions/{session['id']}/answers/{qid}"
    user_client.put(url, json={"answer": "SECRET-ANSWER about pipelines."})
    response = user_client.post(f"{url}/evaluate")
    assert response.status_code == 200, response.text
    feedback = response.json()["answers"][0]["feedback"]
    assert feedback == {
        "score": 3,
        "strengths": ["Clear structure."],
        "improvements": ["Add the result."],
        "source": "fake (fake-1)",
    }
    system = [m for m in _FakeCoach.seen if m.role == "system"]
    assert len(system) == 1 and "SECRET-ANSWER" not in system[0].content
    assert any("SECRET-ANSWER" in m.content for m in _FakeCoach.seen if m.role == "user")
    # Changing the answer clears feedback that described the old one.
    changed = user_client.put(url, json={"answer": "A different answer."}).json()
    assert changed["answers"][0]["feedback"] is None


def test_other_users_cannot_see_or_use_preps(app: FastAPI, user_client: TestClient) -> None:
    prep = _prep(user_client)
    session = _start(user_client, prep)
    qid = session["questions"][0]["id"]
    job_id = prep["job_id"]
    other = login_as(app, "mallory@example.com")
    attempts = [
        other.get(f"{API}/preps/{prep['id']}"),
        other.delete(f"{API}/preps/{prep['id']}"),
        other.post(f"{API}/preps/{prep['id']}/sessions", json={}),
        other.get(f"{API}/sessions/{session['id']}"),
        other.put(f"{API}/sessions/{session['id']}/answers/{qid}", json={"answer": "x"}),
        other.post(f"{API}/sessions/{session['id']}/answers/{qid}/evaluate"),
        other.post(f"{API}/sessions/{session['id']}/complete"),
        other.post(f"{API}/preps", json={"job_id": job_id}),
    ]
    assert [r.status_code for r in attempts] == [404] * len(attempts)
    assert other.get(f"{API}/preps").json() == []
    user_client.headers.pop("x-csrf-token")
    assert user_client.post(f"{API}/preps/{prep['id']}/sessions", json={}).status_code == 403
    user_client.cookies.clear()
    assert user_client.get(f"{API}/preps").status_code == 401


def test_deleting_a_prep_removes_its_sessions(user_client: TestClient) -> None:
    prep = _prep(user_client)
    session = _start(user_client, prep)
    assert user_client.delete(f"{API}/preps/{prep['id']}").status_code == 204
    assert user_client.get(f"{API}/sessions/{session['id']}").status_code == 404
