from __future__ import annotations

import io
from datetime import date

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pypdf import PdfReader

from app.coverletters.draft import _as_clause, _lead_in, draft_letter
from app.jobs.analyzer import analyze_job
from app.matching.matcher import match
from app.output.pdf import render_letter
from app.output.templates import TEMPLATES
from app.resumes.parser import parse_resume
from tests.conftest import login_as
from tests.fixtures import SAMPLE_TEXT
from tests.test_jobs import JD
from tests.test_jobs import create as create_job
from tests.test_resumes import import_and_confirm

API = "/api/v1/cover-letters"


def _resume_lines(content) -> set[str]:  # type: ignore[no-untyped-def]
    lines = {b.strip() for e in content.experience for b in e.bullets}
    lines |= {b.strip() for p in content.projects for b in p.bullets}
    return lines


def test_draft_quotes_only_real_resume_lines_for_strong_requirements() -> None:
    content = parse_resume(SAMPLE_TEXT).content
    job = analyze_job(JD)
    d = draft_letter(
        content, "Senior Backend Engineer", "Northwind", match(content, job, date(2026, 10, 12))
    )
    assert d.title == "Cover letter: Senior Backend Engineer at Northwind"
    assert d.body.startswith(
        "I'm writing to apply for the Senior Backend Engineer role at Northwind."
    )
    assert d.points, "the sample resume backs several of the sample job's requirements"
    real = _resume_lines(content)
    for p in d.points:
        assert p.excerpt in real  # the full line, never a truncated or invented one
        assert p.requirement
    assert d.body.rstrip().endswith("Thank you for your time and consideration.")
    assert len({p.excerpt for p in d.points}) == len(d.points)


def test_draft_without_a_job_leads_with_the_latest_role() -> None:
    content = parse_resume(SAMPLE_TEXT).content
    d = draft_letter(content, None, None, None)
    assert d.title == "Cover letter"
    assert "I'm writing to apply." in d.body and "your team." in d.body
    assert all(p.excerpt in _resume_lines(content) for p in d.points)


def test_clause_reads_naturally_only_for_verb_openers() -> None:
    assert _as_clause("Led the migration to PostgreSQL.") == "I led the migration to PostgreSQL"
    assert _as_clause("Built ETL jobs") == "I built ETL jobs"
    assert (
        _as_clause("Kubernetes migration for 40 services")
        == "one result: Kubernetes migration for 40 services"
    )


def test_letter_pdf_has_greeting_body_and_signature() -> None:
    content = parse_resume(SAMPLE_TEXT).content
    pdf = render_letter(
        content.contact,
        "Dana Lee",
        "Northwind",
        "First paragraph.\n\nSecond one.",
        TEMPLATES["cv-academic"],
        date(2026, 10, 19),
    )
    text = "\n".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(pdf)).pages)
    for part in (
        "Priya Raman",
        "19 October 2026",
        "Dear Dana Lee,",
        "First paragraph.",
        "Second one.",
        "Sincerely,",
    ):
        assert part in text


def test_create_edit_export_and_delete(user_client: TestClient) -> None:
    master = import_and_confirm(user_client)
    job = create_job(user_client, company="Northwind").json()
    created = user_client.post(API, json={"job_id": job["id"], "template": "modern"})
    assert created.status_code == 201, created.text
    letter = created.json()
    assert letter["resume_id"] == master["id"] and letter["company"] == "Northwind"
    assert letter["evidence"] and letter["template"] == "modern"

    edited = user_client.patch(
        f"{API}/{letter['id']}",
        json={
            "recipient_name": "Dana Lee",
            "body": "Hello.\n\nBye.",
            "template": "cv-professional",
        },
    )
    assert edited.status_code == 200 and edited.json()["recipient_name"] == "Dana Lee"
    assert user_client.patch(f"{API}/{letter['id']}", json={"template": "nope"}).status_code == 422

    pdf = user_client.get(f"{API}/{letter['id']}/export.pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF-")
    assert "attachment" in pdf.headers["content-disposition"]
    assert [x["id"] for x in user_client.get(API).json()] == [letter["id"]]
    assert user_client.delete(f"{API}/{letter['id']}").status_code == 204
    assert user_client.get(f"{API}/{letter['id']}").status_code == 404


def test_needs_a_master_resume(user_client: TestClient) -> None:
    r = user_client.post(API, json={})
    assert r.status_code == 409 and r.json()["code"] == "MASTER_RESUME_REQUIRED"


def test_other_users_cannot_use_or_see_letters(app: FastAPI, user_client: TestClient) -> None:
    import_and_confirm(user_client)
    job = create_job(user_client).json()
    letter = user_client.post(API, json={}).json()
    other = login_as(app, "other@example.com")
    assert other.get(API).json() == []
    assert other.get(f"{API}/{letter['id']}").status_code == 404
    assert other.get(f"{API}/{letter['id']}/export.pdf").status_code == 404
    assert other.patch(f"{API}/{letter['id']}", json={"body": "x"}).status_code == 404
    assert other.delete(f"{API}/{letter['id']}").status_code == 404
    import_and_confirm(other)
    assert other.post(API, json={"job_id": job["id"]}).status_code == 404


def test_lead_in_keeps_names_capitalised() -> None:
    assert _lead_in("Kubernetes") == "Kubernetes"
    assert _lead_in("AWS experience") == "AWS experience"
    assert _lead_in("Strong Python skills") == "strong Python skills"
    assert _lead_in("Solid knowledge of SQL") == "solid knowledge of SQL"
