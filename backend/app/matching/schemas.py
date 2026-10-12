from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.matching.matcher import MatchResult


class CreateMatchIn(BaseModel):
    # Defaults to the active master resume.
    resume_id: uuid.UUID | None = None


class MatchSummaryOut(BaseModel):
    id: uuid.UUID
    job_id: uuid.UUID
    job_title: str
    job_company: str | None
    resume_id: uuid.UUID
    resume_title: str
    resume_version: int
    overall: int
    method_version: str
    created_at: datetime
    # True when the resume has a newer version, or the job or matcher rules changed since.
    stale: bool


class MatchOut(MatchSummaryOut):
    result: MatchResult
