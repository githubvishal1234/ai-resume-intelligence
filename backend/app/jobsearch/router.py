"""GET /resumes/{id}/jobs: live openings for one of the user's resumes (master or tailored)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.auth.deps import CurrentAuth
from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.core.ratelimit import RateLimiter
from app.jobsearch import adzuna
from app.jobsearch.ranking import METHOD_VERSION, default_query, rank
from app.resumes.content import ResumeContent
from app.resumes.router import get_resume_service
from app.resumes.service import ResumeService

router = APIRouter(prefix="/resumes", tags=["job search"])

# Each search is a paid-quota call to Adzuna. Per process, like the auth limiter (SECURITY.md).
_limiter = RateLimiter(max_events=30, window_seconds=600)


class JobQueryOut(BaseModel):
    what: str
    where: str


class JobListingOut(BaseModel):
    id: str
    title: str
    company: str | None
    location: str | None
    description: str
    url: str
    created: datetime | None
    salary_min: float | None
    salary_max: float | None
    contract_time: str | None
    shown_skills: list[str]
    listed_skills: list[str]
    missing_skills: list[str]


class JobSearchOut(BaseModel):
    method_version: str
    provider: str
    country: str
    attribution_url: str
    resume_id: uuid.UUID
    resume_version: int
    query: JobQueryOut
    page: int
    total: int
    results: list[JobListingOut]


@router.get("/{resume_id}/jobs", response_model=JobSearchOut)
def jobs_for_resume(
    resume_id: uuid.UUID,
    auth: CurrentAuth,
    service: Annotated[ResumeService, Depends(get_resume_service)],
    settings: Annotated[Settings, Depends(get_settings)],
    what: Annotated[str | None, Query(max_length=100)] = None,
    where: Annotated[str | None, Query(max_length=100)] = None,
    page: Annotated[int, Query(ge=1, le=10)] = 1,
) -> JobSearchOut:
    resume, version = service.get(resume_id)  # 404 for another user's resume
    if not adzuna.configured(settings):
        raise adzuna.JobSearchNotConfigured()
    content = ResumeContent.model_validate(version.content)
    default_what, default_where = default_query(content)
    query = JobQueryOut(
        what=(what if what is not None else default_what).strip(),
        where=(where if where is not None else default_where).strip(),
    )
    if not query.what:
        raise NoSearchWords()
    _limiter.check(str(auth.user.id))
    found = adzuna.search(settings, query.what, query.where, page)
    return JobSearchOut(
        method_version=METHOD_VERSION,
        provider="adzuna",
        country=settings.adzuna_country,
        attribution_url=adzuna.site_url(settings),
        resume_id=resume.id,
        resume_version=version.version,
        query=query,
        page=page,
        total=found.total,
        results=[
            JobListingOut(
                **r.listing.__dict__,
                shown_skills=r.shown,
                listed_skills=r.listed,
                missing_skills=r.missing,
            )
            for r in rank(found.listings, content)
        ],
    )


class NoSearchWords(AppError):
    status_code = 422
    code = "JOB_SEARCH_NO_QUERY"
    message = "Add a job title or skills to search for."
