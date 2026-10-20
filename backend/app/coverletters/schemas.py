from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Line = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]


class CreateLetterIn(BaseModel):
    """Without `resume_id` the active master resume is used. `job_id` is optional."""

    resume_id: uuid.UUID | None = None
    job_id: uuid.UUID | None = None
    template: str = "classic"


class UpdateLetterIn(BaseModel):
    title: (
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
        | None
    ) = None
    recipient_name: Line | None = None
    company: Line | None = None
    body: str | None = Field(default=None, max_length=10_000)
    template: str | None = None


class LetterPointOut(BaseModel):
    requirement: str
    excerpt: str
    source: str


class LetterSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    company: str
    template: str
    resume_id: uuid.UUID | None
    job_id: uuid.UUID | None
    updated_at: datetime


class LetterOut(LetterSummaryOut):
    recipient_name: str
    body: str
    evidence: list[LetterPointOut]
    created_at: datetime
    method_version: str = "letter-v1"
