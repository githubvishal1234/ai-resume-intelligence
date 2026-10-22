"""ATS checks (`ats-rules-v1`) on the PDF a user would actually send.

The PDF is rendered, then read back with a text extractor, the way an applicant tracking
system would read it. Checks compare what comes back with the resume content.
"""

from __future__ import annotations

import io
import re
from datetime import date
from typing import Literal

from pydantic import BaseModel
from pypdf import PdfReader

from app.jobs.analyzer import JobAnalysis
from app.matching.matcher import parse_month
from app.output.pdf import unsupported_characters
from app.output.templates import HEADINGS, TEMPLATES
from app.resumes.content import ResumeContent
from app.skills.vocabulary import find_skills

METHOD_VERSION = "ats-rules-v1"
CheckStatus = Literal["pass", "warn", "fail", "skip"]


class AtsCheck(BaseModel):
    id: str
    title: str
    status: CheckStatus
    detail: str


class AtsReport(BaseModel):
    method_version: str = METHOD_VERSION
    template: str
    pages: int
    score: int
    checks: list[AtsCheck]
    extracted_preview: str


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def _all_text(c: ResumeContent) -> str:
    parts = [c.contact.full_name, c.contact.email, c.contact.phone, c.contact.location, c.summary]
    for e in c.experience:
        parts += [e.title, e.company, e.location, e.start_date, e.end_date, *e.bullets]
    for d in c.education:
        parts += [d.degree, d.field_of_study, d.institution, *d.details]
    parts += [s.name for s in c.skills]
    for p in c.projects:
        parts += [p.name, p.description, *p.technologies, *p.bullets]
    for x in c.certifications:
        parts += [x.name, x.issuer]
    for o in c.other:
        parts += [o.heading, *o.lines]
    return "\n".join(p for p in parts if p)


def _date_style(value: str) -> str | None:
    v = value.strip()
    if not v or re.fullmatch(r"(?i)present|current|now", v):
        return None
    if re.fullmatch(r"[A-Za-z]{3,9}\.?\s*,?\s*\d{4}", v):
        return "month-name"
    if re.fullmatch(r"\d{1,2}\s*/\s*\d{4}|\d{4}\s*-\s*\d{1,2}", v):
        return "numeric"
    if re.fullmatch(r"\d{4}", v):
        return "year"
    return "other"


def ats_check(
    content: ResumeContent,
    pdf: bytes,
    template_id: str,
    job: JobAnalysis | None = None,
    photo: bool = False,
) -> AtsReport:
    """`photo`: the PDF includes the user's photo (a photo template, with one uploaded)."""
    reader = PdfReader(io.BytesIO(pdf))
    extracted = "\n".join(page.extract_text() or "" for page in reader.pages)
    flat = _norm(extracted)
    checks: list[AtsCheck] = []

    def add(id_: str, title: str, status: CheckStatus, detail: str) -> None:
        checks.append(AtsCheck(id=id_, title=title, status=status, detail=detail))

    c = content
    # 1. Contact details are readable as text.
    missing = [
        label
        for label, v in (("name", c.contact.full_name), ("email", c.contact.email))
        if not v or _norm(v) not in flat
    ]
    add(
        "contact.readable",
        "Name and email can be read",
        "pass" if not missing else "fail",
        "Both were read back from the PDF."
        if not missing
        else f"Missing or unreadable: {', '.join(missing)}.",
    )

    # 2. Section headings come out in reading order.
    has_section = {
        "summary": bool(c.summary),
        "experience": bool(c.experience),
        "education": bool(c.education),
        "skills": bool(c.skills),
        "projects": bool(c.projects),
        "certifications": bool(c.certifications),
    }
    expected = [HEADINGS[k] for k in TEMPLATES[template_id].order if has_section[k]]
    lines = [ln.strip().lower() for ln in extracted.splitlines()]
    positions = [lines.index(h.lower()) if h.lower() in lines else -1 for h in expected]
    in_order = all(p >= 0 for p in positions) and positions == sorted(positions)
    add(
        "layout.order",
        "Sections read in the right order",
        "pass" if in_order else "fail",
        f"{len(expected)} standard headings, single column, read top to bottom."
        if in_order
        else "Some section headings were not read back in order.",
    )

    # 3. Every role can be read.
    lost = [
        e.title or e.company
        for e in c.experience
        if any(v and _norm(v) not in flat for v in (e.title, e.company))
    ]
    if not c.experience:
        add("experience.readable", "Every role can be read", "skip", "No roles to check.")
    else:
        add(
            "experience.readable",
            "Every role can be read",
            "pass" if not lost else "fail",
            f"All {len(c.experience)} roles were read back."
            if not lost
            else f"Could not read: {', '.join(lost)}.",
        )

    # 4. Characters the template's fonts cannot show.
    odd = sorted(unsupported_characters(_all_text(c), TEMPLATES[template_id]))
    add(
        "text.characters",
        "All characters can be shown",
        "pass" if not odd else "warn",
        "Every character is supported."
        if not odd
        else "These characters are replaced in the PDF: "
        + " ".join(odd[:12])
        + ". Use plain letters or spell them out (e.g. “INR”).",
    )

    # 5. Consistent date formats.
    styles = {
        s
        for e in c.experience
        for s in (_date_style(e.start_date), _date_style(e.end_date))
        if s is not None
    }
    unparsed = [
        e.title or e.company
        for e in c.experience
        if e.start_date and parse_month(e.start_date, date.today()) is None
    ]
    if not c.experience:
        add("dates.consistent", "Dates use one format", "skip", "No roles to check.")
    elif unparsed:
        add(
            "dates.consistent",
            "Dates use one format",
            "warn",
            f"Dates that systems may not understand: {', '.join(unparsed)}. Use e.g. “Jan 2021”.",
        )
    else:
        add(
            "dates.consistent",
            "Dates use one format",
            "pass" if len(styles - {"year"}) <= 1 else "warn",
            "All dates use the same format."
            if len(styles - {"year"}) <= 1
            else "Mixed date formats (e.g. “Jan 2021” and “01/2021”); pick one.",
        )

    # 6. Length.
    pages = len(reader.pages)
    add(
        "length.pages",
        "Length",
        "pass" if pages <= 2 else "warn",
        f"{pages} page{'s' if pages != 1 else ''}."
        + ("" if pages <= 2 else " Most screeners expect one or two pages."),
    )

    # 7. The job's required skills appear as text (only when the resume was tailored for a job).
    if job is None:
        add(
            "keywords.required",
            "Job's required skills are present",
            "skip",
            "Not tailored for a job, so there are no job skills to compare.",
        )
    else:
        required = [s.name for s in job.skills if s.tier == "required"]
        present = set(find_skills(extracted)) | set(find_skills(extracted, prose=False))
        missing_skills = [s for s in required if s not in present]
        if not required:
            add(
                "keywords.required",
                "Job's required skills are present",
                "skip",
                "The job names no required skills.",
            )
        else:
            add(
                "keywords.required",
                "Job's required skills are present",
                "pass" if not missing_skills else "warn",
                f"All {len(required)} required skills are in the text."
                if not missing_skills
                else f"{len(required) - len(missing_skills)} of {len(required)}; not in the text: "
                f"{', '.join(missing_skills)}. Add them only if they are true.",
            )

    # 8. Layout and photo: both read fine here, but are worth knowing about.
    layout = TEMPLATES[template_id].layout
    if layout != "single":
        add(
            "layout.columns",
            "Single-column layout",
            "warn",
            f"This {layout} layout reads in the right order above, but some older screening "
            "systems handle columns and tables less well. A single-column template is the "
            "safest choice for large employers' online forms.",
        )
    if photo:
        add(
            "photo.included",
            "No photo",
            "warn",
            "Screening software ignores photos, and many employers outside India, Europe and "
            "the Gulf prefer resumes without one. Keep it only where photos are expected.",
        )

    scored = [ch for ch in checks if ch.status != "skip"]
    credit = {"pass": 1.0, "warn": 0.5, "fail": 0.0, "skip": 0.0}
    score = round(100 * sum(credit[ch.status] for ch in scored) / len(scored)) if scored else 0
    return AtsReport(
        template=template_id,
        pages=pages,
        score=score,
        checks=checks,
        extracted_preview=extracted[:4000],
    )
