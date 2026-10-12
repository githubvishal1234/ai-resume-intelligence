from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field

ApplicationStatus = Literal[
    "saved", "applied", "screening", "interviewing", "offer", "accepted", "rejected", "withdrawn"
]
EventKind = Literal["created", "status", "edited", "note"]


class _ApplicationFields(BaseModel):
    url: AnyHttpUrl | None = None
    resume_id: uuid.UUID | None = None
    resume_version: int | None = Field(default=None, ge=1)
    applied_on: date | None = None
    follow_up_on: date | None = None
    notes: str = Field(default="", max_length=10_000)


class CreateApplicationIn(_ApplicationFields):
    """`company` and `role` default to the linked job's company and title."""

    job_id: uuid.UUID | None = None
    company: str | None = Field(default=None, max_length=200)
    role: str | None = Field(default=None, max_length=200)
    status: ApplicationStatus = "saved"


class UpdateApplicationIn(BaseModel):
    """Only the fields sent are changed. Send null to clear an optional field."""

    company: str | None = Field(default=None, min_length=1, max_length=200)
    role: str | None = Field(default=None, min_length=1, max_length=200)
    url: AnyHttpUrl | None = None
    job_id: uuid.UUID | None = None
    resume_id: uuid.UUID | None = None
    resume_version: int | None = Field(default=None, ge=1)
    status: ApplicationStatus | None = None
    applied_on: date | None = None
    follow_up_on: date | None = None
    notes: str | None = Field(default=None, max_length=10_000)


class AddNoteIn(BaseModel):
    note: str = Field(min_length=1, max_length=5_000)


class ApplicationEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: EventKind
    from_status: ApplicationStatus | None
    to_status: ApplicationStatus | None
    fields: list[str]
    note: str | None
    created_at: datetime


class ApplicationSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company: str
    role: str
    url: str | None
    status: ApplicationStatus
    job_id: uuid.UUID | None
    job_title: str | None = None
    resume_id: uuid.UUID | None
    resume_title: str | None = None
    resume_version: int | None
    applied_on: date | None
    follow_up_on: date | None
    follow_up_due: bool = False
    created_at: datetime
    updated_at: datetime


class ApplicationDetailOut(ApplicationSummaryOut):
    notes: str
    events: list[ApplicationEventOut]


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: Literal["follow_up_due"]
    title: str
    body: str
    link: str | None
    read_at: datetime | None
    created_at: datetime


class UnreadCountOut(BaseModel):
    unread: int
