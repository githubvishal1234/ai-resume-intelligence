from __future__ import annotations

import io
from datetime import date

from pypdf import PdfReader

from app.output.order import FRESHER_ORDER, STUDENT_ORDER, section_order, suggested_order
from app.output.pdf import render_pdf
from app.output.templates import TEMPLATES
from app.resumes.content import Education, Experience, Project, ResumeContent

TODAY = date(2026, 11, 9)
# The same cases as frontend/src/lib/sectionOrder.test.ts: both sides must agree.


def _resume(*roles: tuple[str, str], projects: int = 1, education: bool = True) -> ResumeContent:
    return ResumeContent(
        summary="Engineer.",
        experience=[Experience(title="Engineer", start_date=s, end_date=e) for s, e in roles],
        projects=[Project(name=f"P{i}") for i in range(projects)],
        education=[Education(institution="Andhra University")] if education else [],
    )


def test_the_suggestion_follows_the_experience() -> None:
    assert suggested_order(_resume(("Jan 2026", "Present")), TODAY) == list(FRESHER_ORDER)
    assert suggested_order(_resume(("Nov 2025", "Present")), TODAY) == []  # a year: default
    assert suggested_order(_resume(("2019", "2024")), TODAY) == []
    assert suggested_order(_resume(("Jan 2026", "Present"), projects=0), TODAY) == []
    assert suggested_order(_resume(), TODAY) == list(STUDENT_ORDER)
    assert suggested_order(_resume(education=False), TODAY) == []
    assert suggested_order(_resume(("", "")), TODAY) == []  # undated: no guess


def test_a_saved_order_wins_and_cvs_keep_theirs() -> None:
    fresher = _resume(("Jan 2026", "Present"))
    fresher.section_order = ["summary", "experience", "skills"]
    assert section_order(fresher) == ["summary", "experience", "skills"]
    assert section_order(_resume(), kind="cv") == []


def test_the_pdf_uses_the_suggested_order() -> None:
    student = _resume()
    text = "\n".join(
        p.extract_text()
        for p in PdfReader(io.BytesIO(render_pdf(student, TEMPLATES["classic"]))).pages
    )
    assert text.index("Summary") < text.index("Education") < text.index("Projects")
