from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.auth.deps import CurrentAuth
from app.db.session import get_db
from app.matching.matcher import MatchResult
from app.matching.schemas import CreateMatchIn, MatchOut, MatchSummaryOut
from app.matching.service import MatchService, is_stale
from app.models import Job, JobMatch, Resume

router = APIRouter(tags=["matching"])


def get_match_service(auth: CurrentAuth, db: Annotated[Session, Depends(get_db)]) -> MatchService:
    return MatchService(db, auth.actor)


Service = Annotated[MatchService, Depends(get_match_service)]


def _summary(row: JobMatch, job: Job, resume: Resume) -> MatchSummaryOut:
    return MatchSummaryOut(
        id=row.id,
        job_id=job.id,
        job_title=job.title,
        job_company=job.company,
        resume_id=resume.id,
        resume_title=resume.title,
        resume_version=row.resume_version,
        overall=row.overall,
        method_version=row.method_version,
        created_at=row.created_at,
        stale=is_stale(row, job, resume),
    )


def _out(row: JobMatch, job: Job, resume: Resume) -> MatchOut:
    return MatchOut(
        **_summary(row, job, resume).model_dump(), result=MatchResult.model_validate(row.result)
    )


@router.get("/matches", response_model=list[MatchSummaryOut])
def list_matches(service: Service) -> list[MatchSummaryOut]:
    return [_summary(*item) for item in service.latest_per_job()]


@router.post("/jobs/{job_id}/matches", response_model=MatchOut, status_code=status.HTTP_201_CREATED)
def create_match(job_id: uuid.UUID, body: CreateMatchIn, service: Service) -> MatchOut:
    return _out(*service.create(job_id, body.resume_id))


@router.get("/jobs/{job_id}/matches/latest", response_model=MatchOut | None)
def latest_match(job_id: uuid.UUID, service: Service) -> MatchOut | None:
    """The newest match for the job, or null when it has never been matched."""
    found = service.latest(job_id)
    return _out(*found) if found else None
