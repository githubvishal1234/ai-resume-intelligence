"""Resume output: templates, PDF download and ATS checks. Owner-only, like every resume read."""

from __future__ import annotations

import re
import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Query, Response
from pydantic import BaseModel
from sqlalchemy import select

from app.account.photo import load_photo
from app.auth.deps import CurrentAuth
from app.core.errors import AppError
from app.jobs.analyzer import JobAnalysis
from app.models import Job, Resume, TailoringSession
from app.output.ats import AtsReport, ats_check
from app.output.pdf import render_pdf
from app.output.templates import TEMPLATES, Template
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


def _template(template_id: str) -> Template:
    template = TEMPLATES.get(template_id)
    if template is None:
        raise UnknownTemplate()
    return template


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
) -> Response:
    t = _template(template)
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
    resume_id: uuid.UUID, service: Service, template: TemplateQuery = "classic"
) -> AtsReport:
    t = _template(template)
    resume, current = service.get(resume_id)
    content = ResumeContent.model_validate(current.content)
    photo = load_photo(service.storage, resume.owner_id) if t.photo else None
    pdf = render_pdf(content, t, resume.title, photo)
    return ats_check(content, pdf, t.id, _job_for(service, resume), photo is not None)
