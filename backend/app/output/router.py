"""Resume output: templates, PDF download and ATS checks. Owner-only, like every resume read."""

from __future__ import annotations

import re
import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Query, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select

from app.account.photo import load_photo
from app.auth.deps import CurrentAuth
from app.core.errors import AppError, NotFound
from app.jobs.analyzer import JobAnalysis
from app.models import Job, Resume, TailoringSession
from app.output.ats import AtsReport, ats_check
from app.output.fonts import CHOICE_IDS, CHOICES, FONT_DIR, FONT_FILES, FontStyle
from app.output.pdf import render_pdf
from app.output.templates import TEMPLATES, SkillsStyle, Template, with_font, with_skills
from app.resumes.content import ResumeContent
from app.resumes.router import Service

router = APIRouter(tags=["output"])


class UnknownTemplate(AppError):
    status_code = 422
    code = "TEMPLATE_NOT_FOUND"
    message = "This template does not exist."


class TemplateOut(BaseModel):
    id: str
    name: str
    description: str
    kind: Literal["resume", "cv"] = "resume"


class UnknownFont(AppError):
    status_code = 422
    code = "UNKNOWN_FONT"
    message = "That font is not available."


class FontOut(BaseModel):
    id: str
    name: str
    style: FontStyle


def _template(
    template_id: str, font: str | None = None, skills: SkillsStyle | None = None
) -> Template:
    template = TEMPLATES.get(template_id)
    if template is None:
        raise UnknownTemplate()
    if font and font not in CHOICE_IDS:
        raise UnknownFont()
    return with_skills(with_font(template, font), skills)


def _job_for(service: Service, resume: Resume) -> JobAnalysis | None:
    """The job a tailored resume was made for, if any."""
    if resume.kind != "tailored":
        return None
    job = service.db.scalar(
        select(Job)
        .join(TailoringSession, TailoringSession.job_id == Job.id)
        .where(TailoringSession.result_resume_id == resume.id)
    )
    return JobAnalysis.model_validate(job.analysis) if job else None


def _filename(title: str) -> str:
    name = re.sub(r"[^\w\- ]+", "", title).strip().replace(" ", "-")[:80]
    return (name or "resume") + ".pdf"


TemplateQuery = Annotated[str, Query(max_length=40)]
# Empty or left out: the template's own font.
FontQuery = Annotated[str | None, Query(max_length=40)]
# "table": skills as a category | skills table. Left out: the template's own layout.
SkillsQuery = Annotated[SkillsStyle | None, Query()]


@router.get("/output/fonts", response_model=list[FontOut])
def list_fonts() -> list[FontOut]:
    return [FontOut(id=f.id, name=f.name, style=f.style) for f in CHOICES]


@router.get("/output/fonts/{name}.ttf", response_class=FileResponse)
def font_file(name: str) -> FileResponse:
    """The same files the PDF embeds, so the browser preview shows the real letters. Public,
    like any web font: they hold no user data."""
    if name.removesuffix("-Bold") not in CHOICE_IDS:
        raise NotFound()
    return FileResponse(
        FONT_DIR / FONT_FILES[name],
        media_type="font/ttf",
        headers={"cache-control": "public, max-age=604800"},
    )


@router.get("/output/templates", response_model=list[TemplateOut])
def list_templates(auth: CurrentAuth) -> list[TemplateOut]:
    del auth  # signed-in users only, like every other app route
    return [
        TemplateOut(id=t.id, name=t.name, description=t.description, kind=t.kind)
        for t in TEMPLATES.values()
    ]


@router.get("/resumes/{resume_id}/export.pdf", response_class=Response)
def export_pdf(
    resume_id: uuid.UUID,
    service: Service,
    template: TemplateQuery = "classic",
    version: Annotated[int | None, Query(ge=1)] = None,
    font: FontQuery = None,
    skills: SkillsQuery = None,
) -> Response:
    t = _template(template, font, skills)
    resume, current = service.get(resume_id)
    row = service.version(resume_id, version) if version else current
    photo = load_photo(service.storage, resume.owner_id) if t.photo else None
    pdf = render_pdf(ResumeContent.model_validate(row.content), t, resume.title, photo)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"content-disposition": f'attachment; filename="{_filename(resume.title)}"'},
    )


@router.get("/resumes/{resume_id}/ats", response_model=AtsReport)
def ats_report(
    resume_id: uuid.UUID,
    service: Service,
    template: TemplateQuery = "classic",
    font: FontQuery = None,
    skills: SkillsQuery = None,
) -> AtsReport:
    t = _template(template, font, skills)
    resume, current = service.get(resume_id)
    content = ResumeContent.model_validate(current.content)
    photo = load_photo(service.storage, resume.owner_id) if t.photo else None
    pdf = render_pdf(content, t, resume.title, photo)
    return ats_check(content, pdf, t.id, _job_for(service, resume), photo is not None, font or None)
