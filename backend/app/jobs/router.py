from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Request, UploadFile, status
from sqlalchemy.orm import Session

from app.auth.deps import CurrentAuth
from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.jobs.analyzer import JobAnalysis
from app.jobs.schemas import (
    CreateJobIn,
    JobDetailOut,
    JobFromUrlIn,
    JobSummaryOut,
    UpdateJobIn,
)
from app.jobs.service import JobService
from app.models import Job
from app.resumes.extraction import UploadTooLarge

router = APIRouter(prefix="/jobs", tags=["jobs"])


def get_job_service(
    request: Request,
    auth: CurrentAuth,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> JobService:
    return JobService(db, settings, auth.actor, request.scope.get("state", {}).get("request_id"))


Service = Annotated[JobService, Depends(get_job_service)]


def _summary(job: Job) -> JobSummaryOut:
    analysis = job.analysis
    out = JobSummaryOut.model_validate(job)
    out.required_count = sum(
        1 for r in analysis.get("requirements", []) if r.get("tier") == "required"
    )
    out.skill_count = len(analysis.get("skills", []))
    return out


def _detail(job: Job) -> JobDetailOut:
    return JobDetailOut(
        **_summary(job).model_dump(),
        source_url=job.source_url,
        source_filename=job.source_filename,
        raw_text=job.raw_text,
        analysis=JobAnalysis.model_validate(job.analysis),
    )


@router.get("", response_model=list[JobSummaryOut])
def list_jobs(service: Service) -> list[JobSummaryOut]:
    return [_summary(j) for j in service.list_jobs()]


@router.post("", response_model=JobDetailOut, status_code=status.HTTP_201_CREATED)
def create_job(body: CreateJobIn, service: Service) -> JobDetailOut:
    job = service.create(
        body.text,
        source="paste",
        title=body.title,
        company=body.company,
        location=body.location,
        source_url=str(body.source_url) if body.source_url else None,
    )
    return _detail(job)


@router.post("/upload", response_model=JobDetailOut, status_code=status.HTTP_201_CREATED)
async def upload_job(
    service: Service,
    settings: Annotated[Settings, Depends(get_settings)],
    file: Annotated[UploadFile, File(description="PDF, DOCX or TXT job description")],
) -> JobDetailOut:
    data = await file.read(settings.max_upload_bytes + 1)
    if len(data) > settings.max_upload_bytes:
        raise UploadTooLarge(
            f"The file is larger than {settings.max_upload_bytes // (1024 * 1024)} MB."
        )
    return _detail(service.create_from_upload(file.filename or "job.txt", data))


@router.post("/from-url", response_model=JobDetailOut, status_code=status.HTTP_201_CREATED)
def job_from_url(body: JobFromUrlIn, service: Service) -> JobDetailOut:
    return _detail(service.create_from_url(str(body.url)))


@router.get("/{job_id}", response_model=JobDetailOut)
def get_job(job_id: uuid.UUID, service: Service) -> JobDetailOut:
    return _detail(service.get(job_id))


@router.patch("/{job_id}", response_model=JobDetailOut)
def update_job(job_id: uuid.UUID, body: UpdateJobIn, service: Service) -> JobDetailOut:
    job = service.update(
        job_id,
        fields=body.model_fields_set,
        title=body.title,
        company=body.company,
        location=body.location,
    )
    return _detail(job)


@router.post("/{job_id}/reanalyze", response_model=JobDetailOut)
def reanalyze_job(job_id: uuid.UUID, service: Service) -> JobDetailOut:
    return _detail(service.reanalyze(job_id))


@router.post("/{job_id}/ai-analyze", response_model=JobDetailOut)
def ai_analyze_job(job_id: uuid.UUID, service: Service) -> JobDetailOut:
    return _detail(service.ai_analyze(job_id))


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job(job_id: uuid.UUID, service: Service) -> None:
    service.delete(job_id)
