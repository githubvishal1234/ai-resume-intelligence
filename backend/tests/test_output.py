from __future__ import annotations

import io
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pypdf import PdfReader

from app.output.ats import ats_check
from app.output.pdf import render_pdf
from app.output.templates import TEMPLATES
from app.resumes.content import Contact, Experience, ResumeContent
from app.resumes.parser import parse_resume
from tests.conftest import login_as
from tests.fixtures import SAMPLE_TEXT
from tests.test_resumes import import_and_confirm
from tests.test_tailoring import _change, _decide, _session


def _text(pdf: bytes) -> str:
    return "\n".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(pdf)).pages)


@pytest.mark.parametrize("template", sorted(TEMPLATES))
def test_every_template_renders_extractable_text_in_order(template: str) -> None:
    content = parse_resume(SAMPLE_TEXT).content
    pdf = render_pdf(content, TEMPLATES[template])
    assert pdf.startswith(b"%PDF-")
    text = _text(pdf)
    for value in ("Priya Raman", "priya.raman@example.com", "Acme Analytics", "Brightpath Labs"):
        assert value in text
    order = [text.index(h) for h in ("Summary", "Experience", "Education", "Skills")]
    assert order == sorted(order)
    report = ats_check(content, pdf, template)
    statuses = {c.id: c.status for c in report.checks}
    assert statuses["contact.readable"] == "pass"
    assert statuses["layout.order"] == "pass"
    assert statuses["experience.readable"] == "pass"
    assert statuses["keywords.required"] == "skip"
    assert report.pages == 1


def test_ats_flags_missing_email_odd_characters_and_mixed_dates() -> None:
    content = ResumeContent(
        contact=Contact(full_name="Ana Silva"),
        summary="Earned ₹12L bonus ✨ for delivery.",
        experience=[
            Experience(title="Engineer", company="Acme", start_date="Jan 2020", end_date="03/2022"),
        ],
    )
    pdf = render_pdf(content, TEMPLATES["classic"])
    report = ats_check(content, pdf, "classic")
    checks = {c.id: c for c in report.checks}
    assert checks["contact.readable"].status == "fail"
    assert "email" in checks["contact.readable"].detail
    assert checks["text.characters"].status == "warn"
    assert "✨" in checks["text.characters"].detail
    assert checks["dates.consistent"].status == "warn"
    # Characters the font covers are kept; others never reach the PDF as boxes.
    assert "₹12L" in _text(pdf)
    assert "₹" not in checks["text.characters"].detail
    assert report.score < 100


@pytest.mark.parametrize("template", sorted(TEMPLATES))
def test_pdf_keeps_non_western_text(template: str) -> None:
    content = ResumeContent(
        contact=Contact(full_name="José Núñez Ødegård", email="jose@example.com"),
        summary="Привет Ελληνικά Łódź — ≥ 5 years, “quoted”.",
        experience=[Experience(title="Інженер", company="Straße GmbH", start_date="Jan 2020")],
    )
    pdf = render_pdf(content, TEMPLATES[template])
    text = _text(pdf)
    for fragment in (
        "José Núñez Ødegård",
        "Привет",
        "Ελληνικά",
        "Łódź",
        "≥ 5",
        "Інженер",
        "Straße",
    ):
        assert fragment in text
    report = ats_check(content, pdf, template)
    assert {c.id: c.status for c in report.checks}["text.characters"] == "pass"


def test_uncovered_script_is_reported_and_replaced() -> None:
    content = ResumeContent(contact=Contact(full_name="王伟", email="w@example.com"))
    pdf = render_pdf(content, TEMPLATES["serif"])
    checks = {c.id: c for c in ats_check(content, pdf, "serif").checks}
    assert checks["text.characters"].status == "warn"
    assert "王" in checks["text.characters"].detail
    assert "??" in _text(pdf)


def test_export_pdf_and_ats_endpoints(user_client: TestClient) -> None:
    master = import_and_confirm(user_client)
    templates = user_client.get("/api/v1/output/templates").json()
    assert {t["id"] for t in templates} == set(TEMPLATES)

    response = user_client.get(f"/api/v1/resumes/{master['id']}/export.pdf?template=compact")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["content-disposition"] == 'attachment; filename="Master-resume.pdf"'
    assert "Priya Raman" in _text(response.content)

    v1 = user_client.get(f"/api/v1/resumes/{master['id']}/export.pdf?version=1")
    assert v1.status_code == 200
    assert (
        user_client.get(f"/api/v1/resumes/{master['id']}/export.pdf?version=9").status_code == 404
    )
    bad = user_client.get(f"/api/v1/resumes/{master['id']}/export.pdf?template=fancy")
    assert bad.status_code == 422 and bad.json()["code"] == "TEMPLATE_NOT_FOUND"

    report = user_client.get(f"/api/v1/resumes/{master['id']}/ats").json()
    assert report["method_version"] == "ats-rules-v1"
    assert report["template"] == "classic"
    assert 0 <= report["score"] <= 100
    assert "Priya Raman" in report["extracted_preview"]


def test_tailored_resume_ats_compares_the_job_skills(user_client: TestClient) -> None:
    _, session = _session(user_client)
    for kind in ("add_skills", "summary"):
        _decide(user_client, session, _change(session, kind), decision="accepted")
    final: dict[str, Any] = user_client.post(
        f"/api/v1/tailoring/{session['id']}/finalize", json={}
    ).json()
    report = user_client.get(f"/api/v1/resumes/{final['result_resume_id']}/ats").json()
    keywords = next(c for c in report["checks"] if c["id"] == "keywords.required")
    # Tailored for a job, so the job's required skills are compared (not skipped).
    assert keywords["status"] in ("pass", "warn")


def test_export_requires_auth_and_ownership(
    app: FastAPI, client: TestClient, user_client: TestClient
) -> None:
    master = import_and_confirm(user_client)
    other = login_as(app, "mallory@example.com")
    assert other.get(f"/api/v1/resumes/{master['id']}/export.pdf").status_code == 404
    assert other.get(f"/api/v1/resumes/{master['id']}/ats").status_code == 404
    user_client.cookies.clear()
    assert user_client.get(f"/api/v1/resumes/{master['id']}/export.pdf").status_code == 401
