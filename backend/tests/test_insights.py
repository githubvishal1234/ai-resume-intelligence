from __future__ import annotations

from datetime import UTC, date, datetime

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.insights.analysis import (
    MIN_SAMPLE,
    SentApplication,
    attribute_outcomes,
    first_response,
    market_map,
    score_band,
    stage_reached,
)
from app.jobs.analyzer import analyze_job
from app.resumes.content import Experience, ResumeContent, Skill
from tests.conftest import login_as
from tests.test_jobs import JD
from tests.test_jobs import create as create_job
from tests.test_resumes import import_and_confirm

API = "/api/v1/insights"


def _sent(
    status: str,
    seen: tuple[str, ...] = (),
    label: str | None = "Master · v1",
    score: int | None = None,
) -> SentApplication:
    return SentApplication(status, seen, label, score, date(2026, 10, 1), None)


# ---- attribution rules -------------------------------------------------------------------
def test_stage_counts_history_not_just_current_status() -> None:
    assert stage_reached("rejected", ["applied", "screening", "interviewing"]) == 3
    assert stage_reached("withdrawn", []) == 0
    assert stage_reached("saved", []) == 0
    assert stage_reached("offer", []) == 4


def test_score_bands() -> None:
    assert [score_band(s) for s in (None, 10, 50, 74, 75, 100)] == [
        "No match run",
        "0-49",
        "50-74",
        "50-74",
        "75-100",
        "75-100",
    ]


def test_attribution_groups_by_resume_and_flags_small_samples() -> None:
    a = [_sent("screening", label="Tailored · v2", score=80) for _ in range(MIN_SAMPLE)]
    b = [_sent("applied", label="Master · v1", score=40) for _ in range(2)]
    o = attribute_outcomes([*a, *b, _sent("saved")])
    assert o.unsent == 1
    assert (o.total.sent, o.total.responded, o.total.interviewed) == (MIN_SAMPLE + 2, MIN_SAMPLE, 0)
    first, second = o.by_resume
    assert (
        first.label == "Tailored · v2"
        and first.enough
        and first.funnel.rate(first.funnel.responded) == 1.0
    )
    assert second.label == "Master · v1" and not second.enough
    assert [g.label for g in o.by_match] == ["75-100", "0-49"]


def test_rejected_after_interview_still_counts_as_interview() -> None:
    o = attribute_outcomes([_sent("rejected", ("applied", "screening", "interviewing"))])
    assert (o.total.responded, o.total.interviewed, o.total.offers) == (1, 1, 0)


def test_first_response_and_median_wait() -> None:
    at = lambda d: datetime(2026, 10, d, 9, tzinfo=UTC)  # noqa: E731
    assert first_response(
        [("applied", at(2)), ("interviewing", at(9)), ("screening", at(5))]
    ) == date(2026, 10, 5)
    assert first_response([("applied", at(2)), ("rejected", at(3))]) is None
    apps = [
        SentApplication(
            "screening", ["screening"], None, None, date(2026, 10, 1), date(2026, 10, 4)
        ),
        SentApplication(
            "screening", ["screening"], None, None, date(2026, 10, 1), date(2026, 10, 11)
        ),
    ]
    assert attribute_outcomes(apps).median_days_to_response == 6.5


# ---- market map ---------------------------------------------------------------------------
def test_market_map_weights_demand_and_checks_master_evidence() -> None:
    a = analyze_job(
        "Backend Engineer\nRequirements:\n"
        "- 3+ years with Python and PostgreSQL\n- Experience with Kubernetes\n"
    )
    b = analyze_job(
        "Platform Engineer\nRequirements:\n- Strong Python skills\n"
        "- Kubernetes in production\nNice to have:\n- Terraform\n"
    )
    master = ResumeContent(
        skills=[Skill(name="Kubernetes")],
        experience=[
            Experience(
                title="Engineer", company="Acme", bullets=["Built Python services on PostgreSQL"]
            )
        ],
    )
    m = market_map([("Backend Engineer", a), ("Platform Engineer", b)], master)
    by = {s.name: s for s in m.skills}
    assert m.jobs_analyzed == 2
    assert by["Python"].jobs == 2 and by["Python"].status == "strong"
    assert by["Kubernetes"].status == "partial"  # only listed, never used
    assert by["Terraform"].status == "missing"
    assert m.skills[0].name in {"Python", "Kubernetes"}  # most demanded first
    assert m.top_gap is not None and m.top_gap.name == "Terraform"
    assert m.coverage is not None and 0 < m.coverage < 1


def test_market_map_without_master_has_no_statuses() -> None:
    m = market_map([("Backend", analyze_job(JD))], None)
    assert m.skills and all(s.status is None for s in m.skills)
    assert m.coverage is None and m.top_gap is None


# ---- API ----------------------------------------------------------------------------------
def test_insights_endpoints_end_to_end(user_client: TestClient) -> None:
    job = create_job(user_client, company="Northwind").json()
    master = import_and_confirm(user_client)
    assert user_client.post(f"/api/v1/jobs/{job['id']}/matches", json={}).status_code == 201
    app = user_client.post(
        "/api/v1/applications",
        json={"job_id": job["id"], "resume_id": master["id"], "status": "applied"},
    ).json()
    for status in ("screening", "interviewing", "rejected"):
        assert (
            user_client.patch(
                f"/api/v1/applications/{app['id']}", json={"status": status}
            ).status_code
            == 200
        )

    o = user_client.get(f"{API}/outcomes").json()
    assert o["total"]["sent"] == 1 and o["total"]["interviewed"] == 1
    assert o["by_resume"][0]["label"].endswith(f"v{master['current_version']}")
    assert o["by_resume"][0]["enough_data"] is False
    assert o["by_match"][0]["label"] != "No match run"

    m = user_client.get(f"{API}/market").json()
    assert m["jobs_analyzed"] == 1 and m["has_master"] is True
    assert m["skills"] and {s["status"] for s in m["skills"]} <= {"strong", "partial", "missing"}


def test_insights_only_see_own_data(app: FastAPI, user_client: TestClient) -> None:
    create_job(user_client)
    user_client.post(
        "/api/v1/applications", json={"company": "A", "role": "B", "status": "applied"}
    )
    other = login_as(app, "other@example.com")
    assert other.get(f"{API}/outcomes").json()["total"]["sent"] == 0
    assert other.get(f"{API}/market").json()["jobs_analyzed"] == 0


def test_insights_need_sign_in(client: TestClient) -> None:
    assert client.get(f"{API}/outcomes").status_code == 401
    assert client.get(f"{API}/market").status_code == 401
