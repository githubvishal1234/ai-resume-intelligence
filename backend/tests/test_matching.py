from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.jobs.analyzer import analyze_job
from app.matching.matcher import experience_years, match, parse_month
from app.resumes.content import Experience, ResumeContent
from app.resumes.parser import parse_resume
from tests.conftest import login_as
from tests.fixtures import SAMPLE_TEXT
from tests.test_jobs import JD
from tests.test_resumes import import_and_confirm

TODAY = date(2026, 10, 12)


def _match() -> Any:
    return match(parse_resume(SAMPLE_TEXT).content, analyze_job(JD), TODAY)


# ---- dates -----------------------------------------------------------------------------
def test_parse_month_formats() -> None:
    assert parse_month("Jan 2021", TODAY) == (2021, 1)
    assert parse_month("September, 2019", TODAY) == (2019, 9)
    assert parse_month("03/2020", TODAY) == (2020, 3)
    assert parse_month("2020-11", TODAY) == (2020, 11)
    assert parse_month("2019", TODAY) == (2019, 1)
    assert parse_month("Present", TODAY) == (2026, 10)
    assert parse_month("soon", TODAY) is None
    assert parse_month("13/2020", TODAY) is None


def test_experience_years_counts_overlaps_once_and_reports_undated() -> None:
    resume = ResumeContent(
        experience=[
            Experience(start_date="Jan 2020", end_date="Dec 2021"),
            Experience(start_date="Jan 2021", end_date="Dec 2022"),  # overlaps the first
            Experience(start_date="", end_date=""),
        ]
    )
    years, undated = experience_years(resume, TODAY)
    assert years == 3.0
    assert undated == 1
    assert experience_years(ResumeContent(), TODAY) == (None, 0)


# ---- matcher ---------------------------------------------------------------------------
def test_requirement_evidence_statuses() -> None:
    result = _match()
    by_text = {r.text: r for r in result.requirements}
    years = by_text["5+ years of professional software engineering experience."]
    assert years.status == "strong" and "8.4 years" in years.reason
    py = by_text["Strong experience with Python and FastAPI or Django."]
    assert py.status == "strong"
    assert any(e.kind == "experience" for e in py.evidence)
    assert by_text["Bachelor's degree in Computer Science or a related field."].status == "strong"
    # Terraform is only listed under Skills, never shown in a role or project.
    terraform = by_text["Knowledge of Terraform is preferred."]
    assert terraform.status == "partial"
    assert terraform.evidence[0].kind == "skill"
    assert by_text["Experience with Kafka or other streaming platforms."].status == "missing"
    assert by_text["AWS certification is a plus."].status == "missing"


def test_evidence_points_at_real_resume_entities() -> None:
    resume = parse_resume(SAMPLE_TEXT).content
    ids = {e.id for e in resume.experience} | {s.id for s in resume.skills}
    ids |= {e.id for e in resume.education}
    result = match(resume, analyze_job(JD), TODAY)
    for req in result.requirements:
        for ref in req.evidence:
            assert ref.entity_id is None or ref.entity_id in ids
            assert ref.excerpt  # always quotes the resume


def test_skill_gap_severities() -> None:
    gaps = {g.skill: g for g in _match().skills}
    assert gaps["Python"].severity is None
    assert gaps["Kafka"].status == "missing" and gaps["Kafka"].severity == "low"
    assert gaps["Terraform"].status == "partial" and gaps["Terraform"].severity == "low"
    # Django is missing, but "FastAPI or Django" is already met through FastAPI.
    assert gaps["Django"].status == "missing"
    assert gaps["Django"].covered_by_alternative is True
    assert gaps["Django"].severity == "low"


def test_missing_required_skill_is_critical() -> None:
    jd = "Requirements\n- Strong experience with Rust in production.\n- Experience with Python."
    gaps = {
        g.skill: g for g in match(parse_resume(SAMPLE_TEXT).content, analyze_job(jd), TODAY).skills
    }
    assert gaps["Rust"].severity == "critical"
    assert gaps["Python"].severity is None


def test_subscores_and_overall_are_explained_and_renormalized() -> None:
    result = _match()
    keys = {s.key: s for s in result.subscores}
    assert set(keys) == {"skills", "experience", "keywords", "education", "ats"}
    assert all(s.explanation for s in result.subscores)
    assert keys["experience"].score == 100
    applicable = [s for s in result.subscores if s.score is not None]
    expected = round(
        sum(s.score * s.weight for s in applicable) / sum(s.weight for s in applicable)
    )  # type: ignore[operator]
    assert result.overall == expected
    # A posting without years or education leaves those out instead of scoring zero.
    bare = match(parse_resume(SAMPLE_TEXT).content, analyze_job("Requirements\n- Python."), TODAY)
    bare_keys = {s.key: s for s in bare.subscores}
    assert bare_keys["experience"].score is None
    assert bare_keys["education"].score is None


def test_empty_resume_matches_nothing() -> None:
    result = match(ResumeContent(), analyze_job(JD), TODAY)
    assert all(r.status == "missing" for r in result.requirements)
    assert result.resume_years is None


# ---- API -------------------------------------------------------------------------------
def _job(client: TestClient) -> dict[str, Any]:
    response = client.post("/api/v1/jobs", json={"text": JD, "company": "Acme Analytics"})
    assert response.status_code == 201
    body: dict[str, Any] = response.json()
    return body


def test_match_requires_a_master_resume(user_client: TestClient) -> None:
    job = _job(user_client)
    response = user_client.post(f"/api/v1/jobs/{job['id']}/matches", json={})
    assert response.status_code == 422
    assert response.json()["code"] == "MASTER_RESUME_REQUIRED"
    latest = user_client.get(f"/api/v1/jobs/{job['id']}/matches/latest")
    assert latest.status_code == 200 and latest.json() is None


def test_match_snapshot_and_master_is_unchanged(user_client: TestClient) -> None:
    master = import_and_confirm(user_client)
    job = _job(user_client)
    before = user_client.get(f"/api/v1/resumes/{master['id']}").json()

    created = user_client.post(f"/api/v1/jobs/{job['id']}/matches", json={})
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["resume_id"] == master["id"]
    assert body["resume_version"] == 1
    assert body["stale"] is False
    assert 0 <= body["overall"] <= 100
    assert body["result"]["method_version"] == "match-rules-v1"

    # Matching never writes to the master resume.
    after = user_client.get(f"/api/v1/resumes/{master['id']}").json()
    assert after == before
    assert len(user_client.get(f"/api/v1/resumes/{master['id']}/versions").json()) == 1

    latest = user_client.get(f"/api/v1/jobs/{job['id']}/matches/latest").json()
    assert latest["id"] == body["id"]
    listed = user_client.get("/api/v1/matches").json()
    assert [m["job_id"] for m in listed] == [job["id"]]
    assert listed[0]["job_title"] == job["title"]


def test_match_becomes_stale_after_a_resume_edit(user_client: TestClient) -> None:
    master = import_and_confirm(user_client)
    job = _job(user_client)
    user_client.post(f"/api/v1/jobs/{job['id']}/matches", json={})
    content = master["content"]
    content["summary"] = "Backend engineer who also runs Kafka clusters in production."
    saved = user_client.put(
        f"/api/v1/resumes/{master['id']}/content", json={"base_version": 1, "content": content}
    )
    assert saved.status_code == 200
    assert user_client.get(f"/api/v1/jobs/{job['id']}/matches/latest").json()["stale"] is True
    rerun = user_client.post(f"/api/v1/jobs/{job['id']}/matches", json={}).json()
    assert rerun["stale"] is False and rerun["resume_version"] == 2
    kafka = next(g for g in rerun["result"]["skills"] if g["skill"] == "Kafka")
    assert kafka["status"] == "partial"  # mentioned in the summary, not shown in a role


def test_other_users_cannot_match_or_read_matches(app: FastAPI, user_client: TestClient) -> None:
    master = import_and_confirm(user_client)
    job = _job(user_client)
    user_client.post(f"/api/v1/jobs/{job['id']}/matches", json={})
    other = login_as(app, "mallory@example.com")
    attempts = [
        other.post(f"/api/v1/jobs/{job['id']}/matches", json={}),
        other.get(f"/api/v1/jobs/{job['id']}/matches/latest"),
    ]
    assert [r.status_code for r in attempts] == [404, 404]
    # Their own job cannot be matched against someone else's resume either.
    own = _job(other)
    stolen = other.post(f"/api/v1/jobs/{own['id']}/matches", json={"resume_id": master["id"]})
    assert stolen.status_code == 404
    assert other.get("/api/v1/matches").json() == []


def test_deleting_the_job_removes_its_matches(user_client: TestClient) -> None:
    import_and_confirm(user_client)
    job = _job(user_client)
    user_client.post(f"/api/v1/jobs/{job['id']}/matches", json={})
    assert user_client.delete(f"/api/v1/jobs/{job['id']}").status_code == 204
    assert user_client.get("/api/v1/matches").json() == []
