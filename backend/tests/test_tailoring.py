from __future__ import annotations

from collections.abc import Iterator
from datetime import date
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.ai.provider import LLMCapabilities, LLMMessage, LLMProvider, LLMUsage, StructuredResult
from app.ai.registry import register_provider, unregister_provider
from app.core.config import Settings, get_settings
from app.jobs.analyzer import analyze_job
from app.matching.matcher import match
from app.resumes.content import Project, ResumeContent, Skill
from app.resumes.parser import parse_resume
from app.tailoring.factcheck import check_text
from app.tailoring.proposer import (
    ChangeNotApplicable,
    Proposal,
    apply,
    apply_order,
    focus,
    keep_length,
    propose,
)
from app.tailoring.service import TailoringService
from tests.conftest import login_as
from tests.fixtures import SAMPLE_TEXT
from tests.test_jobs import JD
from tests.test_resumes import import_and_confirm

API = "/api/v1/tailoring"


def _master() -> ResumeContent:
    return parse_resume(SAMPLE_TEXT).content


def _proposals(master: ResumeContent | None = None) -> dict[str, Any]:
    master = master or _master()
    job = analyze_job(JD)
    return {p.kind: p for p in propose(master, job, match(master, job, date(2026, 10, 12)))}


# ---- factual check ---------------------------------------------------------------------
def test_factual_check_accepts_facts_from_the_master() -> None:
    master = _master()
    assert check_text("Cut query latency by 40% on 2M requests/day with Python.", master) == []
    assert check_text("Engineer at Acme Analytics working with Kubernetes.", master) == []
    # An opening verb is not part of a name, and AI hyphens (U+2011) match plain ones.
    assert check_text("Engineered Acme Analytics cost‑cutting on Kubernetes.", master) == []
    assert check_text("Kubernetes-driven, Python-enabled services.", master) == []
    # A skill turned into a job title the master doesn't show is flagged; real titles are not.
    assert check_text("Backend engineer with Kubernetes.", master) == []
    assert [f.value for f in check_text("Python developer since Acme Analytics.", master)] == [
        "Python developer"
    ]
    flags = check_text("Engineered Initech pipelines.", master)
    assert [(f.kind, f.value) for f in flags] == [("name", "Initech")]


def test_factual_check_flags_invented_facts() -> None:
    flags = {
        (f.kind, f.value)
        for f in check_text("Cut costs by 55% at Google with Rust since 2012.", _master())
    }
    assert ("number", "55%") in flags
    assert ("date", "2012") in flags
    assert ("technology", "Rust") in flags
    assert ("name", "Google") in flags


# ---- proposals -------------------------------------------------------------------------
def test_proposals_only_reuse_master_content() -> None:
    proposals = _proposals()
    assert set(proposals) >= {"reorder_skills", "add_skills", "summary"}
    reorder = proposals["reorder_skills"]
    assert sorted(i["id"] for i in reorder.proposed["items"]) == sorted(
        i["id"] for i in reorder.original["items"]
    )
    assert reorder.proposed["items"][0]["text"] == "Python"
    assert reorder.requirement_ids  # tied to the requirements it serves
    # Skills shown in experience but not listed are surfaced, with evidence.
    added = [i["text"] for i in proposals["add_skills"].proposed["items"]]
    assert added == ["FastAPI", "PostgreSQL"]
    assert all(e.kind == "experience" for e in proposals["add_skills"].evidence)
    summary = proposals["summary"].proposed["text"]
    assert summary.startswith(_master().summary)
    assert check_text(summary, _master()) == []


def test_reorder_keeps_skill_groups_together() -> None:
    master = ResumeContent(
        skills=[
            Skill(name="Git", category="Tools"),
            Skill(name="Go", category="Languages"),
            Skill(name="Python", category="Languages"),
        ]
    )
    job = analyze_job("Requirements\n- Strong experience with Python.")
    proposal = next(
        p for p in propose(master, job, match(master, job)) if p.kind == "reorder_skills"
    )
    assert [i["text"] for i in proposal.proposed["items"]] == ["Python", "Go", "Git"]


def test_apply_rejects_changes_that_do_not_fit() -> None:
    master = _master()
    reorder = _proposals(master)["reorder_skills"]
    applied = apply(master, reorder, reorder.proposed)
    assert [s.name for s in applied.skills][0] == "Python"
    assert [s.name for s in master.skills] == [s.name for s in _master().skills]  # not mutated
    broken = {"items": reorder.proposed["items"][:-1]}
    with pytest.raises(ChangeNotApplicable):
        apply(master, reorder, broken)


# ---- API -------------------------------------------------------------------------------
def _job(client: TestClient) -> dict[str, Any]:
    response = client.post("/api/v1/jobs", json={"text": JD, "company": "Acme Analytics"})
    assert response.status_code == 201
    body: dict[str, Any] = response.json()
    return body


def _session(client: TestClient) -> tuple[dict[str, Any], dict[str, Any]]:
    master = import_and_confirm(client)
    job = _job(client)
    response = client.post(API, json={"job_id": job["id"]})
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return master, body


def _change(session: dict[str, Any], kind: str) -> dict[str, Any]:
    found: dict[str, Any] = next(c for c in session["changes"] if c["kind"] == kind)
    return found


def _decide(client: TestClient, session: dict[str, Any], change: dict[str, Any], **body: Any):  # type: ignore[no-untyped-def]
    return client.post(f"{API}/{session['id']}/changes/{change['id']}/decision", json=body)


def test_tailoring_requires_a_master(user_client: TestClient) -> None:
    job = _job(user_client)
    response = user_client.post(API, json={"job_id": job["id"]})
    assert response.status_code == 422
    assert response.json()["code"] == "MASTER_RESUME_REQUIRED"


def test_session_lists_changes_with_reasons_requirements_and_ai_status(
    user_client: TestClient,
) -> None:
    _, session = _session(user_client)
    assert session["status"] == "draft"
    assert session["base_version"] == 1
    assert session["ai"]["configured"] is False
    # The job's skills the master never shows: tailoring can't add them, so the page says so.
    assert set(session["missing_skills"]) == {"AWS", "Django", "Kafka", "REST"}
    for change in session["changes"]:
        assert change["decision"] == "pending"
        assert change["reason"] and change["title"]
        assert change["source"] == "rules"
    summary = _change(session, "summary")
    assert summary["editable"] is True
    assert summary["requirements"] and summary["requirements"][0]["text"]
    # Nothing accepted yet: the preview is the master as it is.
    master = user_client.get(f"/api/v1/resumes/{session['master_resume_id']}").json()
    assert session["preview"] == master["content"]


def test_accept_edit_and_factual_check(user_client: TestClient) -> None:
    _, session = _session(user_client)
    summary = _change(session, "summary")
    invented = _decide(
        user_client,
        session,
        summary,
        decision="accepted",
        edited_text="Backend engineer who grew revenue 300% at Google.",
    )
    assert invented.status_code == 422
    body = invented.json()
    assert body["code"] == "FACTUAL_CHECK_FAILED"
    assert any("Google" in d["message"] for d in body["details"])
    stored = _change(user_client.get(f"{API}/{session['id']}").json(), "summary")
    assert stored["decision"] == "pending"
    assert {f["value"] for f in stored["flags"]} >= {"300%", "Google"}

    fixed = _decide(
        user_client,
        session,
        summary,
        decision="accepted",
        edited_text="Backend engineer building Python services with FastAPI and PostgreSQL.",
    )
    assert fixed.status_code == 200, fixed.text
    updated = fixed.json()
    change = _change(updated, "summary")
    assert change["decision"] == "accepted" and change["flags"] == []
    assert updated["preview"]["summary"].startswith("Backend engineer building Python")


def test_only_the_summary_is_editable(user_client: TestClient) -> None:
    _, session = _session(user_client)
    reorder = _change(session, "reorder_skills")
    response = _decide(user_client, session, reorder, decision="accepted", edited_text="x")
    assert response.status_code == 422
    assert response.json()["code"] == "CHANGE_NOT_EDITABLE"


def test_ai_rewrite_needs_a_configured_provider(user_client: TestClient) -> None:
    _, session = _session(user_client)
    summary = _change(session, "summary")
    response = user_client.post(f"{API}/{session['id']}/changes/{summary['id']}/rewrite")
    assert response.status_code == 503
    assert response.json()["code"] == "AI_PROVIDER_NOT_CONFIGURED"


class _Rewrite(BaseModel):
    text: str


class _FakeProvider(LLMProvider):
    name = "fake"
    seen: list[LLMMessage] = []
    calls: list[str] = []
    reply = "Python backend engineer who scaled APIs 10x at Google."
    structured: dict[str, dict[str, Any]] = {}  # replies by schema name; others get `reply`

    @property
    def model(self) -> str:
        return "fake-1"

    @property
    def capabilities(self) -> LLMCapabilities:
        return LLMCapabilities(structured_output=True)

    def generate_structured(self, schema, messages, *, max_output_tokens=None):  # type: ignore[no-untyped-def]
        _FakeProvider.seen = messages
        _FakeProvider.calls.append(schema.__name__)
        parsed = schema(
            **_FakeProvider.structured.get(schema.__name__, {"text": _FakeProvider.reply})
        )
        return StructuredResult(
            parsed=parsed, usage=LLMUsage(), provider="fake", model="fake-1", latency_ms=1.0
        )


@pytest.fixture
def fake_ai(app: FastAPI, settings: Settings) -> Iterator[None]:
    register_provider("fake", lambda s: _FakeProvider())
    app.dependency_overrides[get_settings] = lambda: settings.model_copy(
        update={"llm_provider": "fake", "llm_model": "fake-1"}
    )
    yield
    unregister_provider("fake")
    _FakeProvider.reply = "Python backend engineer who scaled APIs 10x at Google."
    _FakeProvider.structured = {}
    _FakeProvider.calls = []


def test_ai_rewrite_output_is_fact_checked(user_client: TestClient, fake_ai: None) -> None:
    _, session = _session(user_client)
    assert session["ai"]["configured"] is True
    summary = _change(session, "summary")
    response = user_client.post(f"{API}/{session['id']}/changes/{summary['id']}/rewrite")
    assert response.status_code == 200, response.text
    change = _change(response.json(), "summary")
    assert change["source"] == "llm"
    assert "fake" in change["reason"]
    assert {f["value"] for f in change["flags"]} >= {"10x", "Google"}
    # Resume text is passed as data in user messages, never in the system prompt.
    system = [m for m in _FakeProvider.seen if m.role == "system"]
    assert len(system) == 1 and "Priya" not in system[0].content
    # The job's skills the resume doesn't show are named, so the model doesn't borrow them.
    assert (
        "never mention them, not even inside a phrase: AWS, Django, Kafka, REST."
        in system[0].content
    )
    # Shown in the resume, so named as shared (to lead with), never as forbidden.
    forbidden = system[0].content.split("never mention them")[1]
    assert "PostgreSQL" not in forbidden
    assert "ARE in the resume:" in system[0].content
    blocked = _decide(user_client, session, change, decision="accepted")
    assert blocked.status_code == 422


def test_finalize_creates_tailored_resume_and_master_is_unchanged(user_client: TestClient) -> None:
    master, session = _session(user_client)
    before = user_client.get(f"/api/v1/resumes/{master['id']}").json()
    versions_before = user_client.get(f"/api/v1/resumes/{master['id']}/versions").json()

    nothing = user_client.post(f"{API}/{session['id']}/finalize", json={})
    assert nothing.status_code == 422 and nothing.json()["code"] == "NOTHING_ACCEPTED"

    for kind in ("reorder_skills", "add_skills", "summary"):
        assert (
            _decide(user_client, session, _change(session, kind), decision="accepted").status_code
            == 200
        )
    done = user_client.post(f"{API}/{session['id']}/finalize", json={"title": "Acme backend"})
    assert done.status_code == 200, done.text
    final = done.json()
    assert final["status"] == "finalized"

    tailored = user_client.get(f"/api/v1/resumes/{final['result_resume_id']}").json()
    assert tailored["kind"] == "tailored"
    assert tailored["master_resume_id"] == master["id"]
    assert tailored["title"] == "Acme backend"
    assert tailored["content"]["skills"][0]["name"] == "Python"
    assert {"FastAPI", "PostgreSQL"} <= {s["name"] for s in tailored["content"]["skills"]}
    assert tailored["content"] == final["preview"]
    tailored_versions = user_client.get(f"/api/v1/resumes/{tailored['id']}/versions").json()
    assert [v["source"] for v in tailored_versions] == ["tailoring"]

    # The invariant: the master resume is exactly as it was.
    assert user_client.get(f"/api/v1/resumes/{master['id']}").json() == before
    assert user_client.get(f"/api/v1/resumes/{master['id']}/versions").json() == versions_before

    again = user_client.post(f"{API}/{session['id']}/finalize", json={})
    assert again.status_code == 409 and again.json()["code"] == "TAILORING_NOT_DRAFT"
    listed = user_client.get(API).json()
    assert listed[0]["status"] == "finalized" and listed[0]["accepted"] == 3


def test_quick_tailor_from_pasted_text_keeps_the_users_master(user_client: TestClient) -> None:
    master = import_and_confirm(user_client)
    before = user_client.get(f"/api/v1/resumes/{master['id']}").json()

    response = user_client.post(f"{API}/quick", json={"resume_text": SAMPLE_TEXT, "job_text": JD})
    assert response.status_code == 201, response.text
    started = response.json()
    assert started["status"] == "draft" and started["master_resume_id"] != master["id"]
    # Nothing is decided until the user has answered the skill questions.
    assert {c["decision"] for c in started["changes"]} == {"pending"}
    assert "Django" in started["missing_skills"]

    session = user_client.post(f"{API}/{started['id']}/tailor", json={"skills": []}).json()
    assert _change(session, "reorder_skills")["decision"] == "accepted"
    assert _change(session, "trim_skills")["decision"] == "accepted"
    # Every missing skill was answered "no", so none of them is added.
    assert _change(session, "add_job_skills")["decision"] == "rejected"

    pasted = user_client.get(f"/api/v1/resumes/{session['master_resume_id']}").json()
    assert pasted["kind"] == "master" and pasted["status"] == "archived"
    assert user_client.get(f"/api/v1/resumes/{master['id']}").json() == before
    done = user_client.post(f"{API}/{session['id']}/finalize", json={})
    assert done.status_code == 200, done.text


def test_quick_tailor_without_text_uses_the_master(user_client: TestClient) -> None:
    none = user_client.post(f"{API}/quick", json={"job_text": JD})
    assert none.status_code == 422 and none.json()["code"] == "MASTER_RESUME_REQUIRED"
    master = import_and_confirm(user_client)
    response = user_client.post(f"{API}/quick", json={"job_text": JD})
    assert response.status_code == 201, response.text
    assert response.json()["master_resume_id"] == master["id"]


def test_resume_text_reads_an_uploaded_file(user_client: TestClient) -> None:
    files = {"file": ("cv.txt", SAMPLE_TEXT.encode(), "text/plain")}
    response = user_client.post(f"{API}/resume-text", files=files)
    assert response.status_code == 200, response.text
    assert "Python" in response.json()["text"]


def test_a_skill_answered_yes_reaches_the_tailored_copy(user_client: TestClient) -> None:
    started = user_client.post(f"{API}/quick", json={"resume_text": SAMPLE_TEXT, "job_text": JD})
    session = started.json()
    role = next(p["id"] for p in session["places"] if "Brightpath" in p["label"])
    answers = {"skills": [{"skill": "Django", "where": role, "note": "built Django admin tools"}]}
    tailored = user_client.post(f"{API}/{session['id']}/tailor", json=answers)
    assert tailored.status_code == 200, tailored.text
    body = tailored.json()
    assert "Django" not in body["missing_skills"]
    done = user_client.post(f"{API}/{session['id']}/finalize", json={}).json()
    copy = user_client.get(f"/api/v1/resumes/{done['result_resume_id']}").json()["content"]
    assert "Django" in [s["name"] for s in copy["skills"]]
    brightpath = next(e for e in copy["experience"] if e["company"] == "Brightpath Labs")
    assert "Built Django admin tools." in brightpath["bullets"]


def test_quick_tailor_refuses_text_that_is_not_a_resume(user_client: TestClient) -> None:
    junk = "Hello, this is just a note about lunch plans. " * 10
    response = user_client.post(f"{API}/quick", json={"resume_text": junk, "job_text": JD})
    assert response.status_code == 422
    assert response.json()["code"] == "RESUME_TEXT_UNREADABLE"


def test_rejected_changes_are_not_applied(user_client: TestClient) -> None:
    master, session = _session(user_client)
    _decide(user_client, session, _change(session, "summary"), decision="accepted")
    response = _decide(user_client, session, _change(session, "summary"), decision="rejected")
    assert response.json()["preview"]["summary"] == master["content"]["summary"]


def test_discard(user_client: TestClient) -> None:
    _, session = _session(user_client)
    assert user_client.post(f"{API}/{session['id']}/discard").status_code == 204
    assert user_client.get(API).json() == []
    assert user_client.post(f"{API}/{session['id']}/discard").status_code == 409


def test_a_finished_session_can_leave_the_list_and_its_resume_stays(
    user_client: TestClient,
) -> None:
    _, session = _session(user_client)
    _decide(user_client, session, _change(session, "reorder_skills"), decision="accepted")
    done = user_client.post(f"{API}/{session['id']}/finalize", json={}).json()
    assert user_client.post(f"{API}/{session['id']}/discard").status_code == 204
    assert user_client.get(API).json() == []
    tailored = user_client.get(f"/api/v1/resumes/{done['result_resume_id']}")
    assert tailored.status_code == 200 and tailored.json()["kind"] == "tailored"


def test_other_users_cannot_touch_a_session(app: FastAPI, user_client: TestClient) -> None:
    _, session = _session(user_client)
    change = session["changes"][0]
    other = login_as(app, "mallory@example.com")
    base = f"{API}/{session['id']}"
    attempts = [
        other.get(base),
        other.post(f"{base}/changes/{change['id']}/decision", json={"decision": "accepted"}),
        other.post(f"{base}/changes/{change['id']}/rewrite"),
        other.post(f"{base}/bullets/rewrite", json={"experience_id": "x", "bullet_index": 0}),
        other.post(f"{base}/finalize", json={}),
        other.post(f"{base}/discard"),
        other.post(API, json={"job_id": session["job_id"]}),
    ]
    assert [r.status_code for r in attempts] == [404] * len(attempts)
    assert other.get(API).json() == []


# ---- bullet rewrites -------------------------------------------------------------------
def _bullet_url(session: dict[str, Any]) -> str:
    return f"{API}/{session['id']}/bullets/rewrite"


def test_session_lists_master_bullets(user_client: TestClient) -> None:
    _, session = _session(user_client)
    bullets = session["bullets"]
    assert [b["index"] for b in bullets[:2]] == [0, 1]
    assert bullets[0]["role"].endswith("at Acme Analytics")
    assert bullets[0]["text"].startswith("Led migration of the reporting pipeline")
    assert all(b["change_id"] is None for b in bullets)


def test_bullet_rewrite_needs_a_configured_provider(user_client: TestClient) -> None:
    _, session = _session(user_client)
    b = session["bullets"][0]
    body = {"experience_id": b["experience_id"], "bullet_index": 0}
    response = user_client.post(_bullet_url(session), json=body)
    assert response.status_code == 503
    assert response.json()["code"] == "AI_PROVIDER_NOT_CONFIGURED"
    assert len(user_client.get(f"{API}/{session['id']}").json()["changes"]) == len(
        session["changes"]
    )


def test_bullet_rewrite_is_a_fact_checked_editable_change(
    user_client: TestClient, fake_ai: None
) -> None:
    master, session = _session(user_client)
    b = session["bullets"][1]  # "Designed a FastAPI service handling 2M requests/day ..."
    body = {"experience_id": b["experience_id"], "bullet_index": b["index"]}

    _FakeProvider.reply = "Designed a FastAPI service for 3M requests/day at Google."
    response = user_client.post(_bullet_url(session), json=body)
    assert response.status_code == 200, response.text
    updated = response.json()
    change = _change(updated, "rewrite_bullet")
    assert change["source"] == "llm" and change["editable"] is True
    assert change["original"] == {"text": b["text"]}
    assert {f["value"] for f in change["flags"]} >= {"3M", "Google"}
    assert updated["bullets"][1]["change_id"] == change["id"]
    assert len(updated["changes"]) == len(session["changes"]) + 1
    # The bullet is passed as data, never in the system prompt.
    system = [m for m in _FakeProvider.seen if m.role == "system"]
    assert len(system) == 1 and b["text"] not in system[0].content
    assert any(b["text"] in m.content for m in _FakeProvider.seen if m.role == "user")
    assert _decide(user_client, updated, change, decision="accepted").status_code == 422

    # Asking again regenerates the same change instead of adding another.
    _FakeProvider.reply = "Built a FastAPI service handling 2M requests/day with 99.95% uptime."
    again = user_client.post(_bullet_url(session), json=body).json()
    assert len(again["changes"]) == len(updated["changes"])
    change = _change(again, "rewrite_bullet")
    assert change["flags"] == [] and change["decision"] == "pending"
    accepted = _decide(user_client, again, change, decision="accepted")
    assert accepted.status_code == 200, accepted.text
    roles = accepted.json()["preview"]["experience"]
    assert roles[0]["bullets"][1] == _FakeProvider.reply

    # The user may reword it, still under the factual check.
    edited = _decide(
        user_client, again, change, decision="accepted", edited_text="Ran it at Netflix."
    )
    assert edited.status_code == 422
    assert user_client.get(f"/api/v1/resumes/{master['id']}").json()["current_version"] == 1


def test_bullet_rewrite_rejects_unknown_bullets(user_client: TestClient, fake_ai: None) -> None:
    _, session = _session(user_client)
    b = session["bullets"][0]
    for body in (
        {"experience_id": b["experience_id"], "bullet_index": 99},
        {"experience_id": "not-a-role", "bullet_index": 0},
    ):
        response = user_client.post(_bullet_url(session), json=body)
        assert response.status_code == 422
        assert response.json()["code"] == "BULLET_NOT_FOUND"


def test_bullet_rewrite_applies_after_a_reorder_of_the_same_role() -> None:
    master = _master()
    exp = master.experience[0]
    first, second = exp.bullets
    reorder = Proposal(
        kind="reorder_bullets",
        target_id=exp.id,
        title="",
        original={},
        proposed={"items": [{"id": None, "text": t} for t in (second, first)]},
        reason="",
    )
    rewrite = Proposal(
        kind="rewrite_bullet",
        target_id=exp.id,
        title="",
        original={"text": first},
        proposed={"text": "Moved reporting to PostgreSQL, cutting query latency by 40%."},
        reason="",
    )
    content = master
    for p in sorted([rewrite, reorder], key=lambda p: apply_order(p.kind)):
        content = apply(content, p, p.proposed)
    assert content.experience[0].bullets == [second, rewrite.proposed["text"]]
    assert master.experience[0].bullets == [first, second]  # the master is untouched


# ---- maximum focus ---------------------------------------------------------------------
def _focus_master() -> ResumeContent:
    master = _master()
    master.experience[0].bullets += [
        "Organised the office football league.",
        "Ran the office book club.",
    ]
    master.projects = [
        Project(name="Recipe blog", description="A personal cooking blog."),
        Project(
            name="Orders API",
            technologies=["Python", "FastAPI", "PostgreSQL"],
            bullets=["Built REST endpoints for order lookups."],
        ),
    ]
    return master


def test_focus_reshapes_the_copy_with_only_master_facts() -> None:
    master = _focus_master()
    job = analyze_job(JD)
    proposals = focus(master, job, match(master, job, date(2026, 10, 12)))
    headline = next(p for p in proposals if p.kind == "headline").proposed["text"]
    assert headline.startswith("Senior Software Engineer | ")
    assert check_text(headline, master) == []
    doc = master
    for p in proposals:
        doc = apply(doc, p, p.proposed)
    assert doc.contact.headline == headline
    # The API project fits best, so it moves up to sit right before experience.
    assert doc.section_order == [
        "summary", "projects", "experience", "education", "skills", "certifications",
    ]  # fmt: skip
    # Maximum focus: unrelated bullets go, but every role stays with at least one.
    assert doc.experience[0].bullets == master.experience[0].bullets[:2]
    assert [e.company for e in doc.experience] == [e.company for e in master.experience]
    assert all(e.bullets for e in doc.experience)
    assert [p.name for p in doc.projects] == ["Orders API"]
    assert master.contact.headline == "" and len(master.projects) == 2  # not mutated


def test_confirmed_skills_can_be_used_and_reach_the_copy(user_client: TestClient) -> None:
    master, session = _session(user_client)
    sid = session["id"]
    focused = user_client.post(f"{API}/{sid}/focus")
    assert focused.status_code == 200, focused.text
    kinds = {c["kind"] for c in focused.json()["changes"]}
    assert "headline" in kinds and not any(c["source"] == "llm" for c in focused.json()["changes"])
    assert "Django" in focused.json()["missing_skills"]

    summary = _change(focused.json(), "summary")
    text = "Backend engineer building Python and Django services."
    blocked = _decide(user_client, session, summary, decision="accepted", edited_text=text)
    assert blocked.status_code == 422

    confirmed = user_client.post(
        f"{API}/{sid}/skills", json={"skill": "django", "note": "Admin tools at Brightpath Labs"}
    )
    assert confirmed.status_code == 200, confirmed.text
    body = confirmed.json()
    assert "Django" not in body["missing_skills"]
    assert _change(body, "confirm_skill")["decision"] == "accepted"
    ok = _decide(user_client, session, summary, decision="accepted", edited_text=text)
    assert ok.status_code == 200, ok.text

    accepted = user_client.post(f"{API}/{sid}/accept-clean").json()
    by_kind = {c["kind"]: c for c in accepted["changes"]}
    # The job's skills are a claim about the user, so accepting everything leaves them alone.
    assert by_kind["add_job_skills"]["decision"] == "pending"
    others = [c for c in accepted["changes"] if c["kind"] != "add_job_skills"]
    assert all(c["decision"] == "accepted" for c in others if not c["flags"])
    assert all(c["decision"] == "pending" for c in others if c["flags"])
    done = user_client.post(f"{API}/{sid}/finalize", json={}).json()
    copy = user_client.get(f"/api/v1/resumes/{done['result_resume_id']}").json()["content"]
    assert "Django" in [s["name"] for s in copy["skills"]]
    assert copy["contact"]["headline"]
    original = user_client.get(f"/api/v1/resumes/{master['id']}").json()["content"]
    assert original["contact"]["headline"] == ""
    assert "Django" not in [s["name"] for s in original["skills"]]


def test_focus_with_ai_rewrites_everything_in_one_call(
    user_client: TestClient, fake_ai: None
) -> None:
    _, session = _session(user_client)
    _FakeProvider.structured = {
        "FocusOut": {
            "headline": "Senior Software Engineer | Python, FastAPI, PostgreSQL",
            "summary": "Backend engineer building Python APIs at Google.",
            "bullets": [
                {
                    "key": "b1",
                    "text": "Migrated reporting to PostgreSQL, cutting query latency by 40%.",
                }
            ],
        }
    }
    _FakeProvider.calls = []
    _FakeProvider.reply = "Backend engineer building Python APIs."  # the repair's answer
    response = user_client.post(f"{API}/{session['id']}/focus")
    assert response.status_code == 200, response.text
    body = response.json()
    # One rewrite call, one repair for the summary that named Google, one claim check.
    assert _FakeProvider.calls == ["FocusOut", "RewriteOut", "ClaimReport"]
    headline = _change(body, "headline")
    assert headline["source"] == "llm" and headline["proposed"]["text"].startswith(
        "Senior Software"
    )
    assert not [f for f in headline["flags"] if f["severity"] == "block"]
    summary = _change(body, "summary")
    assert summary["proposed"]["text"] == "Backend engineer building Python APIs."
    assert summary["flags"] == []
    bullet = _change(body, "rewrite_bullet")
    assert bullet["proposed"]["text"].startswith("Migrated")
    assert bullet["original"]["text"].startswith("Led migration")


def test_focus_keeps_the_rule_headline_when_the_ai_one_is_blocked(
    user_client: TestClient, fake_ai: None
) -> None:
    _, session = _session(user_client)
    _FakeProvider.structured = {
        "FocusOut": {"headline": "Rust Developer | Rust", "summary": "Backend engineer."}
    }
    body = user_client.post(f"{API}/{session['id']}/focus").json()
    headline = _change(body, "headline")
    assert headline["source"] == "rules"
    assert headline["proposed"]["text"].startswith("Senior Software Engineer | ")
    assert headline["flags"] == []


def test_flagged_ai_headline_falls_back_to_the_rule_built_one(
    user_client: TestClient, fake_ai: None
) -> None:
    _, session = _session(user_client)
    _FakeProvider.structured = {
        "FocusOut": {
            "headline": "Senior Software Engineer | Python",
            "summary": "Backend engineer building Python APIs.",
        },
        # The claim check doubts the headline (text 1), so the rules' version is used.
        "ClaimReport": {"claims": [{"item": 1, "claim": "Python", "supported": False}]},
    }
    body = user_client.post(f"{API}/{session['id']}/focus").json()
    headline = _change(body, "headline")
    assert headline["source"] == "rules" and headline["flags"] == []
    assert headline["proposed"]["text"].startswith("Senior Software Engineer | ")


def test_focus_leaves_out_unrelated_skills_but_keeps_added_ones() -> None:
    master = _master()
    extra = ["LangChain", "FAISS", "Ollama", "RAG", "Pinecone", "LlamaIndex", "Tableau", "Excel"]
    master.skills += [Skill(name=n, category="Other") for n in extra]
    job = analyze_job(JD)
    trim = next(
        p
        for p in focus(master, job, match(master, job, date(2026, 10, 12)))
        if p.kind == "trim_skills"
    )
    kept = [i["text"] for i in trim.proposed["items"]]
    # The job's skills stay, topped up from their own groups to the ATS minimum of five.
    assert kept == ["Python", "SQL", "Go", "Docker", "Terraform"]
    added = master.model_copy(deep=True)
    added.skills.append(Skill(name="Django", category=""))
    assert "Django" in [s.name for s in apply(added, trim, trim.proposed).skills]


def test_focus_never_trims_a_short_resume_below_the_ats_minimum() -> None:
    master = _focus_master()  # a short resume: trimming would leave too little
    proposals = focus(master, analyze_job(JD), match(master, analyze_job(JD), date(2026, 10, 12)))
    assert {"trim_bullets", "trim_projects"} <= {p.kind for p in proposals}
    kept = {p.kind for p in keep_length(master, proposals)}
    assert "trim_projects" not in kept and "trim_bullets" not in kept
    assert {"headline", "trim_skills"} <= kept  # the rest of the focus stays
    longer = master.model_copy(deep=True)
    longer.summary = " ".join(["Engineer building Python services."] * 80)
    assert {p.kind for p in keep_length(longer, proposals)} == {p.kind for p in proposals}


def test_a_confirmed_skill_joins_a_group_that_stays_after_focus() -> None:
    master = _master()
    master.skills.append(Skill(name="Ollama", category="GenAI"))  # a tool the job ignores
    job = analyze_job(JD)
    result = match(master, job, date(2026, 10, 12))
    jira = Proposal(
        kind="confirm_skill",
        title="",
        original={"items": []},
        proposed={"items": [{"id": "jira", "text": "Jira"}]},
        reason="",
    )
    doc = master
    for p in sorted([*propose(master, job, result), jira, *focus(master, job, result)],
                    key=lambda p: apply_order(p.kind)):  # fmt: skip
        doc = apply(doc, p, p.proposed)
    groups = {s.name: s.category for s in doc.skills}
    # Not "GenAI": that group is trimmed away, so Jira joins the tools that stay.
    assert "Ollama" not in groups and groups["Jira"] == groups["Terraform"] == "Tools"


def test_focus_keeps_the_users_words_when_the_ai_polish_is_flagged(
    user_client: TestClient, fake_ai: None
) -> None:
    _, session = _session(user_client)
    role = next(p["id"] for p in session["places"] if "Brightpath" in p["label"])
    note = "built Django admin tools for 3 internal teams"
    body = {"skill": "Django", "note": note, "where": role}
    assert user_client.post(f"{API}/{session['id']}/skills", json=body).status_code == 200
    _FakeProvider.structured = {
        "FocusOut": {
            "headline": "Senior Software Engineer | Python",
            "summary": "Backend engineer building Python APIs.",
            "bullets": [{"key": "a1", "text": "Built Django admin tools at Google for 3 teams."}],
        }
    }
    focused = user_client.post(f"{API}/{session['id']}/focus").json()
    bullet = _change(focused, "add_bullet")
    # "Google" is invented and the repair keeps it, so the user's own sentence stays.
    assert bullet["proposed"]["text"] == "Built Django admin tools for 3 internal teams."
    assert bullet["decision"] == "accepted" and bullet["flags"] == []
    assert bullet["source"] == "user"


def test_a_confirmed_skill_with_a_role_becomes_a_bullet_there(user_client: TestClient) -> None:
    master, session = _session(user_client)
    sid = session["id"]
    places = {p["label"]: p["id"] for p in session["places"]}
    role = places["Software Engineer at Brightpath Labs"]
    note = "built Django admin tools for 3 internal teams"
    body = user_client.post(
        f"{API}/{sid}/skills", json={"skill": "Django", "note": note, "where": role}
    ).json()
    bullet = _change(body, "add_bullet")
    assert bullet["target_id"] == role and bullet["decision"] == "accepted"
    assert bullet["proposed"]["text"] == "Built Django admin tools for 3 internal teams."
    assert bullet["flags"] == []  # "Django" and "3" come from the user, so they are allowed
    done = user_client.post(f"{API}/{sid}/finalize", json={}).json()
    copy = user_client.get(f"/api/v1/resumes/{done['result_resume_id']}").json()["content"]
    brightpath = next(e for e in copy["experience"] if e["company"] == "Brightpath Labs")
    assert brightpath["bullets"][-1] == "Built Django admin tools for 3 internal teams."
    assert brightpath["title"] == "Software Engineer"  # the role itself never changes
    original = user_client.get(f"/api/v1/resumes/{master['id']}").json()["content"]
    assert (
        len(next(e for e in original["experience"] if e["company"] == "Brightpath Labs")["bullets"])
        == 2
    )

    # A finished session can no longer change.
    body = user_client.post(f"{API}/{sid}/skills", json={"skill": "Django"})
    assert body.status_code == 409


def test_a_session_starts_even_with_nothing_to_reorder(user_client: TestClient) -> None:
    import_and_confirm(user_client)
    job = user_client.post(
        "/api/v1/jobs",
        json={"text": "Robot Simulation Engineer\n\nRequirements\n- Unity and ROS 2."},
    ).json()
    response = user_client.post(API, json={"job_id": job["id"]})
    assert response.status_code == 201, response.text
    assert {"Unity", "ROS"} <= set(response.json()["missing_skills"])


def test_focus_keeps_the_masters_section_order_and_skips_soft_skills() -> None:
    master = _focus_master()
    master.section_order = ["summary", "skills", "experience", "projects", "education"]
    master.experience[0].bullets.append("Improved communication with the analytics team.")
    job = analyze_job(JD + "\n- Strong communication skills.")
    result = match(master, job, date(2026, 10, 12))
    props = {p.kind: p for p in focus(master, job, result) + propose(master, job, result)}
    order = [i["id"] for i in props["reorder_sections"].proposed["items"]]
    assert order == ["summary", "skills", "projects", "experience", "education", "certifications"]
    assert "Communication" not in props["headline"].proposed["text"]
    add = props.get("add_skills")
    assert "Communication" not in [i["text"] for i in (add.proposed["items"] if add else [])]


def test_a_reworded_project_bullet_lands_in_that_project() -> None:
    master = _focus_master()
    project = master.projects[1]
    change = Proposal(
        kind="rewrite_bullet",
        target_id=project.id,
        title="Reword a bullet at Orders API",
        original={"text": project.bullets[0]},
        proposed={"text": "Built REST endpoints for fast order lookups."},
        reason="",
    )
    doc = apply(master, change, change.proposed)
    assert doc.projects[1].bullets == ["Built REST endpoints for fast order lookups."]


def test_a_headline_title_must_be_one_the_candidate_holds() -> None:
    flags = TailoringService._flags("headline", {"text": "Backend Engineer | Python"}, _master())
    assert [f["value"] for f in flags] == ["Backend Engineer"]
    ok = {"text": "Senior Software Engineer | Python"}
    assert TailoringService._flags("headline", ok, _master()) == []


def test_added_skills_join_the_group_of_similar_skills() -> None:
    master = _master()  # "Languages: Python, SQL, Go" and "Tools: Docker, Kubernetes, ..."
    change = Proposal(
        kind="add_skills",
        title="Add skills",
        original={"items": []},
        proposed={"items": [{"id": "x1", "text": "Rust"}, {"id": "x2", "text": "Leadership"}]},
        reason="",
    )
    skills = apply(master, change, change.proposed).skills
    rust = next(s for s in skills if s.name == "Rust")
    assert rust.category == "Languages"
    assert [s.name for s in skills].index("Rust") == [s.name for s in skills].index("Go") + 1
    # No similar group: one named by its kind, rather than an unlabeled line.
    assert next(s for s in skills if s.name == "Leadership").category == "Soft Skills"


def test_added_skills_keep_front_end_groups_for_front_end_skills() -> None:
    master = _master()
    master.skills.append(Skill(name="React", category="Frontend"))
    names = [".NET", "HTML", "Agile", "Scrum"]
    change = Proposal(
        kind="confirm_skill",
        title="",
        original={"items": []},
        proposed={"items": [{"id": f"n{i}", "text": n} for i, n in enumerate(names)]},
        reason="",
    )
    groups = {s.name: s.category for s in apply(master, change, change.proposed).skills}
    assert groups[".NET"] == "Frameworks"  # a framework, but not a front-end one
    assert groups["HTML"] == "Frontend"
    assert groups["Agile"] == groups["Scrum"] == "Practices"


def test_job_skills_are_proposed_and_can_be_trimmed_before_accepting(
    user_client: TestClient,
) -> None:
    master, session = _session(user_client)
    sid = session["id"]
    change = _change(session, "add_job_skills")
    proposed = [i["text"] for i in change["proposed"]["items"]]
    assert change["decision"] == "pending"
    assert set(proposed) == set(session["missing_skills"]) and "Django" in proposed

    # Keep only Django and accept: it becomes a confirmed skill of this copy.
    body = _decide(user_client, session, change, decision="accepted", keep_skills=["Django"])
    assert body.status_code == 200, body.text
    kept = _change(body.json(), "add_job_skills")
    assert [i["text"] for i in kept["edited"]["items"]] == ["Django"]
    assert "Django" not in body.json()["missing_skills"]
    summary = _change(body.json(), "summary")
    text = "Backend engineer building Python and Django services."
    ok = _decide(user_client, session, summary, decision="accepted", edited_text=text)
    assert ok.status_code == 200, ok.text  # Django is now allowed in new wording

    done = user_client.post(f"{API}/{sid}/finalize", json={}).json()
    copy = user_client.get(f"/api/v1/resumes/{done['result_resume_id']}").json()["content"]
    names = [s["name"] for s in copy["skills"]]
    assert "Django" in names and not set(proposed) - {"Django"} & set(names)
    original = user_client.get(f"/api/v1/resumes/{master['id']}").json()["content"]
    assert "Django" not in [s["name"] for s in original["skills"]]


def test_only_the_job_skills_change_takes_a_skill_list(user_client: TestClient) -> None:
    _, session = _session(user_client)
    summary = _change(session, "summary")
    body = _decide(user_client, session, summary, decision="accepted", keep_skills=["Python"])
    assert body.status_code == 422 and body.json()["code"] == "CHANGE_NOT_EDITABLE"
