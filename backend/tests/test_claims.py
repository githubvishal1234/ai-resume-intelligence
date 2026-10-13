"""Factual check layer 2: the LLM claim check."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.ai.provider import LLMCapabilities, LLMMessage, LLMProvider, LLMUsage, StructuredResult
from app.ai.registry import register_provider, unregister_provider
from app.core.config import Settings, get_settings
from app.core.errors import AiProviderFailed
from app.tailoring.claims import ClaimReport, check_claims
from tests.test_tailoring import API, _change, _decide, _master, _session


class _Stub(LLMProvider):
    """Answers rewrites with `rewrite` and claim checks with `claims`; records every call."""

    name = "fake"
    rewrite = "Led migration of the reporting pipeline to PostgreSQL."
    claims: list[dict[str, Any]] = []
    fail_claims = False
    calls: list[tuple[str, list[LLMMessage]]] = []

    @property
    def model(self) -> str:
        return "fake-1"

    @property
    def capabilities(self) -> LLMCapabilities:
        return LLMCapabilities(structured_output=True)

    def generate_structured(self, schema, messages, *, max_output_tokens=None):  # type: ignore[no-untyped-def]
        _Stub.calls.append((schema.__name__, messages))
        if schema is ClaimReport:
            if _Stub.fail_claims:
                raise AiProviderFailed()
            parsed: BaseModel = ClaimReport.model_validate({"claims": _Stub.claims})
        else:
            parsed = schema(text=_Stub.rewrite)
        return StructuredResult(
            parsed=parsed, usage=LLMUsage(), provider="fake", model="fake-1", latency_ms=1.0
        )


@pytest.fixture(autouse=True)
def _reset() -> Iterator[None]:
    _Stub.claims, _Stub.fail_claims, _Stub.calls = [], False, []
    _Stub.rewrite = "Led migration of the reporting pipeline to PostgreSQL."
    yield


@pytest.fixture
def fake_ai(app: FastAPI, settings: Settings) -> Iterator[None]:
    register_provider("fake", lambda s: _Stub())
    app.dependency_overrides[get_settings] = lambda: settings.model_copy(
        update={"llm_provider": "fake", "llm_model": "fake-1"}
    )
    yield
    unregister_provider("fake")


# ---- unit ------------------------------------------------------------------------------
def test_claims_count_as_supported_only_with_real_evidence() -> None:
    master = _master()
    _Stub.claims = [
        {
            "claim": "Migrated the reporting pipeline",
            "supported": True,
            "evidence": "Led migration of the reporting pipeline to PostgreSQL",
        },
        {"claim": "Managed a team of engineers", "supported": False, "evidence": ""},
        # The model says "supported" but the quote is not in the resume.
        {"claim": "Owned the product roadmap", "supported": True, "evidence": "owned the roadmap"},
    ]
    flags = check_claims(
        "Migrated the pipeline, managed a team, owned the roadmap.", master, _Stub()
    )
    assert [(f.kind, f.severity, f.value) for f in flags] == [
        ("claim", "warn", "Managed a team of engineers"),
        ("claim", "warn", "Owned the product roadmap"),
    ]
    name, messages = _Stub.calls[0]
    assert name == "ClaimReport"
    system = [m for m in messages if m.role == "system"]
    assert len(system) == 1 and "owned the roadmap" not in system[0].content
    assert any("owned the roadmap" in m.content for m in messages if m.role == "user")


def test_claim_check_failure_is_a_warning_not_an_error() -> None:
    _Stub.fail_claims = True
    flags = check_claims("Led a team.", _master(), _Stub())
    assert len(flags) == 1 and flags[0].severity == "warn"
    assert "could not run" in flags[0].message


# ---- through the API -------------------------------------------------------------------
def test_ai_rewrite_gets_claim_warnings_that_do_not_block(
    user_client: TestClient, fake_ai: None
) -> None:
    _, session = _session(user_client)
    summary = _change(session, "summary")
    _Stub.rewrite = "Backend engineer who mentored a team building Python services."
    _Stub.claims = [{"claim": "Mentored a team", "supported": False, "evidence": ""}]
    response = user_client.post(f"{API}/{session['id']}/changes/{summary['id']}/rewrite")
    assert response.status_code == 200, response.text
    change = _change(response.json(), "summary")
    assert [(f["kind"], f["severity"]) for f in change["flags"]] == [("claim", "warn")]
    assert "Mentored a team" in change["flags"][0]["message"]
    assert [name for name, _ in _Stub.calls] == ["RewriteOut", "ClaimReport"]
    accepted = _decide(user_client, session, change, decision="accepted")
    assert accepted.status_code == 200, accepted.text
    assert _change(accepted.json(), "summary")["decision"] == "accepted"
    finished = user_client.post(f"{API}/{session['id']}/finalize", json={})
    assert finished.status_code == 200, finished.text


def test_layer_one_blocks_skip_the_claim_check(user_client: TestClient, fake_ai: None) -> None:
    _, session = _session(user_client)
    summary = _change(session, "summary")
    _Stub.rewrite = "Grew revenue 300% at Google."
    response = user_client.post(f"{API}/{session['id']}/changes/{summary['id']}/rewrite")
    change = _change(response.json(), "summary")
    assert {f["severity"] for f in change["flags"]} == {"block"}
    assert [name for name, _ in _Stub.calls] == ["RewriteOut"]
    assert _decide(user_client, session, change, decision="accepted").status_code == 422


def test_user_edits_get_the_claim_check_when_ai_is_set_up(
    user_client: TestClient, fake_ai: None
) -> None:
    _, session = _session(user_client)
    summary = _change(session, "summary")
    _Stub.claims = [{"claim": "Led the platform team", "supported": False, "evidence": ""}]
    response = _decide(
        user_client,
        session,
        summary,
        decision="accepted",
        edited_text="Backend engineer who led the platform team.",
    )
    assert response.status_code == 200, response.text
    change = _change(response.json(), "summary")
    assert change["decision"] == "accepted"
    assert [f["value"] for f in change["flags"]] == ["Led the platform team"]


def test_without_ai_only_layer_one_runs(user_client: TestClient) -> None:
    _, session = _session(user_client)
    summary = _change(session, "summary")
    response = _decide(
        user_client,
        session,
        summary,
        decision="accepted",
        edited_text="Backend engineer who led the platform team.",
    )
    assert response.status_code == 200, response.text
    assert _change(response.json(), "summary")["flags"] == []
