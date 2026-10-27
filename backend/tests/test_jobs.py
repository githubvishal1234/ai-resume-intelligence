from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.jobs.analyzer import analyze_job, guess_title
from app.skills.vocabulary import canonical, find_skills
from tests.conftest import login_as
from tests.fixtures import make_docx, make_pdf

API = "/api/v1/jobs"

JD = """Senior Backend Engineer
Acme Analytics · Bengaluru (Hybrid) · Full-time
Salary: ₹35-45 LPA

About us
We build data tools for retailers.

What you'll do
- Design and build REST APIs used by thousands of customers.
- Mentor engineers and review code.

Requirements
- 5+ years of professional software engineering experience.
- Strong experience with Python and FastAPI or Django.
- Solid knowledge of PostgreSQL and query optimization.
- Bachelor's degree in Computer Science or a related field.
- Knowledge of Terraform is preferred.

Nice to have
- Experience with Kafka or other streaming platforms.
- AWS certification is a plus.

Benefits
- Health insurance for your family.
"""


def create(client: TestClient, text: str = JD, **extra: str):  # type: ignore[no-untyped-def]
    return client.post(API, json={"text": text, **extra})


# ---- vocabulary ------------------------------------------------------------------------
def test_vocabulary_matches_aliases_and_respects_ambiguous_casing() -> None:
    assert find_skills("We use Postgres, k8s and ReactJS.") == ["PostgreSQL", "Kubernetes", "React"]
    # "go", "express", "spring" as ordinary words are not skills.
    assert find_skills("You will go the extra mile and express ideas this spring.") == []
    assert set(find_skills("Backend services in Go and Rust.")) == {"Go", "Rust"}
    assert "C++" in find_skills("Strong C++ and C# skills")
    assert canonical("golang") == "Go"
    assert canonical("unknown thing") is None


# ---- analyzer --------------------------------------------------------------------------
def test_analyzer_splits_requirement_tiers_and_facts() -> None:
    analysis = analyze_job(JD, guess_title(JD))
    tiers = {r.text: r.tier for r in analysis.requirements}
    assert tiers["5+ years of professional software engineering experience."] == "required"
    assert tiers["Strong experience with Python and FastAPI or Django."] == "required"
    assert tiers["Knowledge of Terraform is preferred."] == "preferred"
    assert tiers["Experience with Kafka or other streaming platforms."] == "nice_to_have"
    # Responsibilities, about-us and benefits are not requirements.
    assert not any("Health insurance" in t or "retailers" in t for t in tiers)
    assert any("REST APIs" in r for r in analysis.responsibilities)
    skills = {s.name: s.tier for s in analysis.skills}
    assert skills["Python"] == "required"
    assert skills["Kafka"] == "nice_to_have"
    assert analysis.years_experience_min == 5
    assert analysis.education_level == "Bachelor's"
    assert analysis.seniority == "Senior"
    assert analysis.employment_type == "Full-time"
    assert analysis.work_mode == "Hybrid"
    assert analysis.salary and "35" in analysis.salary
    assert guess_title(JD) == "Senior Backend Engineer"


def test_keywords_leave_out_the_company_name() -> None:
    text = JD + "\nAcme Analytics values craft. Acme Analytics ships weekly.\n"
    assert "acme" in analyze_job(text).keywords
    assert "acme" not in analyze_job(text, company="Acme Analytics").keywords


def test_analyzer_never_invents_facts() -> None:
    text = "Software Engineer\nWe are hiring engineers to work on our product with the team."
    analysis = analyze_job(text, guess_title(text))
    assert analysis.salary is None
    assert analysis.years_experience_min is None
    assert analysis.education_level is None
    assert analysis.work_mode is None
    # Every requirement is text copied from the posting.
    for req in analyze_job(JD).requirements:
        assert req.text in JD


def test_requirement_ids_are_stable_across_reanalysis() -> None:
    first = [r.id for r in analyze_job(JD).requirements]
    second = [r.id for r in analyze_job(JD).requirements]
    assert first == second and len(set(first)) == len(first)


def test_analyzer_without_headings_warns_and_uses_sentences() -> None:
    text = (
        "Data Analyst. You have 3+ years of experience with SQL and Tableau. "
        "We offer flexible hours and a friendly office in Pune."
    )
    analysis = analyze_job(text)
    assert analysis.warnings
    assert any("SQL" in r.skills for r in analysis.requirements)
    assert analysis.years_experience_min == 3


# ---- API -------------------------------------------------------------------------------
def test_create_list_get_job(user_client: TestClient) -> None:
    response = create(user_client, company="Acme Analytics")
    assert response.status_code == 201, response.text
    job = response.json()
    assert job["title"] == "Senior Backend Engineer"
    assert job["company"] == "Acme Analytics"
    assert job["source"] == "paste"
    assert job["required_count"] >= 4
    assert job["analysis"]["analyzer_version"] == "jd-rules-v1"
    listed = user_client.get(API).json()
    assert [j["id"] for j in listed] == [job["id"]]
    assert listed[0]["skill_count"] == len(job["analysis"]["skills"])
    assert user_client.get(f"{API}/{job['id']}").json()["raw_text"].startswith("Senior Backend")


def test_title_from_request_wins_over_guess(user_client: TestClient) -> None:
    job = create(user_client, title="  Platform Engineer  ").json()
    assert job["title"] == "Platform Engineer"


@pytest.mark.parametrize(
    "text", ["", "too short", "x" * 50_001], ids=["empty", "short", "too-long"]
)
def test_create_rejects_bad_text(user_client: TestClient, text: str) -> None:
    response = create(user_client, text=text)
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"


def test_whitespace_padded_short_text_is_rejected(user_client: TestClient) -> None:
    response = create(user_client, text="short" + " " * 80)
    assert response.status_code == 422
    assert response.json()["code"] == "JOB_TEXT_INVALID"


@pytest.mark.parametrize(
    ("name", "data"),
    [("jd.docx", make_docx(JD)), ("jd.txt", JD.encode()), ("jd.pdf", make_pdf(JD))],
    ids=["docx", "txt", "pdf"],
)
def test_upload_job_file(user_client: TestClient, name: str, data: bytes) -> None:
    response = user_client.post(f"{API}/upload", files={"file": (name, data)})
    assert response.status_code == 201, response.text
    job = response.json()
    assert job["source"] == "upload"
    assert job["source_filename"] == name
    assert any(s["name"] == "Python" for s in job["analysis"]["skills"])


def test_upload_rejects_unsupported_file(user_client: TestClient) -> None:
    response = user_client.post(f"{API}/upload", files={"file": ("jd.pdf", b"not a pdf")})
    assert response.status_code == 422
    assert response.json()["code"] == "UPLOAD_REJECTED"


def test_url_import_is_refused_with_paste_fallback(user_client: TestClient) -> None:
    response = user_client.post(
        f"{API}/from-url", json={"url": "https://www.linkedin.com/jobs/view/123"}
    )
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "JOB_SOURCE_NOT_SUPPORTED"
    assert "paste it instead" in body["message"]
    assert user_client.get(API).json() == []
    bad = user_client.post(f"{API}/from-url", json={"url": "file:///etc/passwd"})
    assert bad.status_code == 422 and bad.json()["code"] == "VALIDATION_ERROR"


def test_update_reanalyze_delete(user_client: TestClient) -> None:
    job = create(user_client, company="Acme").json()
    updated = user_client.patch(
        f"{API}/{job['id']}", json={"location": "Remote", "company": ""}
    ).json()
    assert updated["location"] == "Remote"
    assert updated["company"] is None
    assert updated["title"] == job["title"]
    again = user_client.post(f"{API}/{job['id']}/reanalyze")
    assert again.status_code == 200
    assert [r["id"] for r in again.json()["analysis"]["requirements"]] == [
        r["id"] for r in job["analysis"]["requirements"]
    ]
    assert user_client.delete(f"{API}/{job['id']}").status_code == 204
    assert user_client.get(f"{API}/{job['id']}").status_code == 404


def test_jobs_require_auth_and_csrf(client: TestClient, user_client: TestClient) -> None:
    del user_client.headers["x-csrf-token"]
    assert create(user_client).status_code == 403
    user_client.cookies.clear()
    assert user_client.get(API).status_code == 401


def test_other_users_cannot_see_or_change_a_job(app: FastAPI, user_client: TestClient) -> None:
    job = create(user_client).json()
    other = login_as(app, "mallory@example.com")
    url = f"{API}/{job['id']}"
    attempts = [
        other.get(url),
        other.patch(url, json={"title": "pwned"}),
        other.post(f"{url}/reanalyze"),
        other.delete(url),
    ]
    assert [r.status_code for r in attempts] == [404] * len(attempts)
    assert other.get(API).json() == []
    assert user_client.get(url).json()["title"] == job["title"]


NAUKRI_JD = """Job Description

Below are the required set of proficiencies which we are looking for
- Core java concepts (Java 8 is required) like Multi-Threading and Design Patterns.
- Must be good in Spring and microservices (spring boot, spring cloud, Netflix OSS).
- Good Understanding of database concepts and ORM tools.

o Must Have Skills

Working Knowledge of JAVA 6 or Higher, J2EE, Spring, Spring Boot, Spring MVC
Knowledge of HTML, HTML5, JavaScript, XML, XSLT

Disclaimer: This job posting has been aggregated from an external source.
Role: Full Stack Developer
Industry Type: IT Services & Consulting
Employment Type: Full Time, Permanent
Education
UG: Any Graduate
PG: Any Postgraduate
Key Skills
html5spring cloudspring datajava technologiesormcore javajavascript
"""


def test_job_board_trailer_and_intro_are_not_requirements() -> None:
    analysis = analyze_job(NAUKRI_JD, "Java Developer")
    texts = [r.text for r in analysis.requirements]
    assert len(texts) == 5
    for noise in (
        "Below are",
        "Disclaimer",
        "Role:",
        "Industry",
        "UG:",
        "Key Skills",
        "html5spring",
    ):
        assert not any(t.startswith(noise) for t in texts), noise
    skills = {s.name for s in analysis.skills}
    assert {
        "Java",
        "Spring",
        "Microservices",
        "Multithreading",
        "Design Patterns",
        "ORM",
        "Netflix OSS",
        "J2EE",
        "XML",
        "XSLT",
        "HTML",
        "JavaScript",
    } <= skills
    assert "Spring" in find_skills("Built services with Spring Boot and Spring Cloud")


ROBOTICS_JD = """Digital-Twin and Robotics Simulation Engineer

Roles & Responsibilities
 Build digital twins of robot platforms in NVIDIA Omniverse and Isaac Sim.
 Integrate simulation outputs with ROS 2 nodes.

Work Experience
 4-9 years of software / simulation engineering experience.
 Strong Python scripting skills for simulation automation.
 Prior experience with Unity3D or Unreal Engine using C++ is a strong plus.
 Understanding of USD (Universal Scene Description) based workflows.

Desired / Good-to-have Skills
 Experience with reinforcement learning or imitation learning workflows.
"""


def test_work_experience_heading_and_robotics_skills() -> None:
    analysis = analyze_job(ROBOTICS_JD)
    assert "Work Experience" in analysis.sections_found
    tiers = {r.text[:20]: r.tier for r in analysis.requirements}
    assert tiers["Strong Python scripti"[:20]] == "required"
    assert tiers["Prior experience wit"] == "preferred"  # "a strong plus"
    assert not any(r.text.startswith("Build digital twins") for r in analysis.requirements)
    names = {s.name for s in analysis.skills}
    assert {"Python", "Unity", "Unreal Engine", "OpenUSD", "Reinforcement Learning"} <= names
    assert {"NVIDIA Omniverse", "Isaac Sim", "ROS"} <= set(find_skills(ROBOTICS_JD))
    # Ordinary words are not skills.
    assert find_skills("We value unity, and pay in USD.") == []
