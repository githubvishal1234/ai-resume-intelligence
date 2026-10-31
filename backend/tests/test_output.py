from __future__ import annotations

import io
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pypdf import PdfReader

from app.output.ats import ats_check
from app.output.pdf import render_pdf
from app.output.templates import DESIGNS, PALETTES, RESUME_ORDER, TEMPLATES, arrange
from app.resumes.content import Contact, Experience, Project, ResumeContent
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
    names = {
        "summary": "Summary",
        "experience": "Experience",
        "education": "Education",
        "skills": "Skills",
    }
    # Heading lines, in any case ("EXPERIENCE" on One Page): an ATS reads both.
    lines = [ln.strip().lower() for ln in text.splitlines()]
    order = [lines.index(names[k].lower()) for k in TEMPLATES[template].order if k in names]
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
    text = " ".join(_text(pdf).split())  # a narrow sidebar may wrap the name onto two lines
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


def test_academic_cv_leads_with_education_and_the_ats_check_follows_its_order() -> None:
    content = parse_resume(SAMPLE_TEXT).content
    pdf = render_pdf(content, TEMPLATES["cv-academic"])
    text = _text(pdf)
    assert text.index("Education") < text.index("Experience")
    statuses = {c.id: c.status for c in ats_check(content, pdf, "cv-academic").checks}
    assert statuses["layout.order"] == "pass"


def _luminance(hex_colour: str) -> float:
    def lin(c: float) -> float:
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (lin(int(hex_colour[i : i + 2], 16) / 255) for i in (1, 3, 5))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def test_every_design_comes_in_every_palette_with_readable_banner_text() -> None:
    for design in DESIGNS:
        for palette, hex_colour in PALETTES.items():
            assert TEMPLATES[f"{design}-{palette}"].accent == hex_colour
    # White name and contact on the band, and the accent as heading text on white.
    for hex_colour in PALETTES.values():
        assert (1.05) / (_luminance(hex_colour) + 0.05) >= 4.5


def test_headline_and_section_order_reach_the_pdf_and_the_ats_check() -> None:
    content = parse_resume(SAMPLE_TEXT).content
    content.contact.headline = "Backend Engineer | Python, PostgreSQL"
    content.projects = [Project(name="Search service", bullets=["Built a search API."])]
    content.section_order = ["projects", "experience"]
    assert arrange(RESUME_ORDER, content.section_order) == [
        "summary", "projects", "experience", "education", "skills", "certifications",
    ]  # fmt: skip
    for template in ("classic", "sidebar-navy", "timeline-navy", "split-navy"):
        pdf = render_pdf(content, TEMPLATES[template])
        text = " ".join(_text(pdf).split())
        assert "Backend Engineer | Python, PostgreSQL" in text, template
        assert text.index("Projects") < text.index("Experience"), template
        statuses = {c.id: c.status for c in ats_check(content, pdf, template).checks}
        assert statuses["layout.order"] == "pass", template


def test_one_page_template_fits_a_full_resume_on_one_page() -> None:
    line = "Built Python and FastAPI services with authentication, retrieval and SQL storage, " * 2
    content = parse_resume(SAMPLE_TEXT).content
    content.summary = " ".join([content.summary] * 3)
    content.experience[0].bullets = [line] * 4
    content.experience = content.experience[:1]
    content.projects = [Project(name=f"Project {i}", bullets=[line] * 5) for i in range(2)]
    pdf = render_pdf(content, TEMPLATES["one-page"])
    assert len(PdfReader(io.BytesIO(pdf)).pages) == 1
    assert len(PdfReader(io.BytesIO(render_pdf(content, TEMPLATES["classic"]))).pages) == 2
    text = _text(pdf)
    assert "EXPERIENCE" in text and "PROJECTS" in text  # uppercase headings
    assert {c.id: c.status for c in ats_check(content, pdf, "one-page").checks}["layout.order"] == (
        "pass"
    )
