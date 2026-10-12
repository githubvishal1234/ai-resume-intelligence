from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field

from app.jobs.analyzer import JobAnalysis

MIN_JOB_CHARS = 50
MAX_JOB_CHARS = 50_000


class _JobMetaIn(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    company: str | None = Field(default=None, max_length=200)
    location: str | None = Field(default=None, max_length=200)


class CreateJobIn(_JobMetaIn):
    text: str = Field(min_length=MIN_JOB_CHARS, max_length=MAX_JOB_CHARS)
    source_url: AnyHttpUrl | None = None


class JobFromUrlIn(BaseModel):
    url: AnyHttpUrl


class UpdateJobIn(_JobMetaIn):
    pass


class JobSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    source: Literal["paste", "upload", "url"]
    title: str
    company: str | None
    location: str | None
    created_at: datetime
    updated_at: datetime
    required_count: int = 0
    skill_count: int = 0


class JobDetailOut(JobSummaryOut):
    source_url: str | None
    source_filename: str | None
    raw_text: str
    analysis: JobAnalysis
