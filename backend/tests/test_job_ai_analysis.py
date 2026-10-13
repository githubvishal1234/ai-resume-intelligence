"""Phase 12: AI-assisted job analysis, with every quote checked against the posting."""

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
from tests.test_jobs import API, JD, create

ANSWER: dict[str, Any] = {
    "requirements": [
        {
            "quote": "Strong experience with Python and FastAPI or Django.",
            "tier": "required",
            "category": "skill",
        },
        {"quote": "Knowledge of Terraform is preferred.", "tier": "preferred", "category": "skill"},
        {
            "quote": "Experience with Kafka or other streaming platforms.",
            "tier": "nice_to_have",
            "category": "experience",
        },
        {"quote": "10+ years of Rust.", "tier": "required", "category": "skill"},  # not in JD
    ],
    "responsibilities": ["Mentor engineers and review code.", "Run the company."],
}


class _Analyst(LLMProvider):
    name = "fake"
    answer: dict[str, Any] = ANSWER
    seen: list[LLMMessage] = []

    @property
    def model(self) -> str:
        return "fake-1"

    @property
    def capabilities(self) -> LLMCapabilities:
        return LLMCapabilities(structured_output=True)

    def generate_structured(self, schema, messages, *, max_output_tokens=None):  # type: ignore[no-untyped-def]
        _Analyst.seen = messages
        return StructuredResult(
            parsed=schema.model_validate(_Analyst.answer),
            usage=LLMUsage(),
            provider="fake",
            model="fake-1",
            latency_ms=1.0,
        )


@pytest.fixture
def fake_ai(app: FastAPI, settings: Settings) -> Iterator[None]:
    register_provider("fake", lambda s: _Analyst())
    app.dependency_overrides[get_settings] = lambda: settings.model_copy(
        update={"llm_provider": "fake", "llm_model": "fake-1"}
    )
    yield
    unregister_provider("fake")
    _Analyst.answer = ANSWER


def test_ai_analysis_needs_a_configured_provider(user_client: TestClient) -> None:
    job = create(user_client).json()
    response = user_client.post(f"{API}/{job['id']}/ai-analyze")
    assert response.status_code == 503
    assert response.json()["code"] == "AI_PROVIDER_NOT_CONFIGURED"


def test_ai_analysis_keeps_only_quotes_from_the_posting(
    user_client: TestClient, fake_ai: None
) -> None:
    job = create(user_client).json()
    response = user_client.post(f"{API}/{job['id']}/ai-analyze")
    assert response.status_code == 200, response.text
    a = response.json()["analysis"]
    assert a["analyzer_version"] == "jd-ai-v1"
    assert (a["ai_provider"], a["ai_model"]) == ("fake", "fake-1")
    assert [(r["text"], r["tier"]) for r in a["requirements"]] == [
        ("Strong experience with Python and FastAPI or Django.", "required"),
        ("Knowledge of Terraform is preferred.", "preferred"),
        ("Experience with Kafka or other streaming platforms.", "nice_to_have"),
    ]
    assert a["responsibilities"] == ["Mentor engineers and review code."]
    assert a["ai_dropped"] == [
        "Requirement: “10+ years of Rust.”",
        "Responsibility: “Run the company.”",
    ]
    # Skills and facts are derived from the kept quotes by the rules, not by the model.
    tiers = {s["name"]: s["tier"] for s in a["skills"]}
    assert tiers["Python"] == "required" and tiers["Kafka"] == "nice_to_have"
    assert "Rust" not in tiers
    assert a["salary"] == "₹35-45 LPA"
    # The posting is passed as data, never in the system prompt.
    system = [m for m in _Analyst.seen if m.role == "system"]
    assert len(system) == 1 and "Terraform" not in system[0].content


def test_rules_reanalysis_undoes_the_ai_analysis(user_client: TestClient, fake_ai: None) -> None:
    job = create(user_client).json()
    user_client.post(f"{API}/{job['id']}/ai-analyze")
    back = user_client.post(f"{API}/{job['id']}/reanalyze").json()["analysis"]
    assert back["analyzer_version"] == "jd-rules-v1" and back["ai_provider"] is None
    assert back["requirements"] == job["analysis"]["requirements"]


def test_an_answer_with_no_real_requirement_is_refused(
    user_client: TestClient, fake_ai: None
) -> None:
    job = create(user_client).json()
    _Analyst.answer = {"requirements": [{"quote": "Speak Klingon.", "tier": "required"}]}
    response = user_client.post(f"{API}/{job['id']}/ai-analyze")
    assert response.status_code == 422 and response.json()["code"] == "AI_ANALYSIS_EMPTY"
    assert user_client.get(f"{API}/{job['id']}").json()["analysis"] == job["analysis"]


def test_ai_analysis_marks_existing_matches_stale(user_client: TestClient, fake_ai: None) -> None:
    from tests.test_resumes import import_and_confirm

    import_and_confirm(user_client)
    job = create(user_client, JD).json()
    match = user_client.post(f"{API}/{job['id']}/matches", json={})
    assert match.status_code == 201, match.text
    user_client.post(f"{API}/{job['id']}/ai-analyze")
    assert user_client.get(f"{API}/{job['id']}/matches/latest").json()["stale"] is True


def test_other_users_cannot_ai_analyze(
    app: FastAPI, user_client: TestClient, fake_ai: None
) -> None:
    job = create(user_client).json()
    other = login_as(app, "mallory@example.com")
    assert other.post(f"{API}/{job['id']}/ai-analyze").status_code == 404
