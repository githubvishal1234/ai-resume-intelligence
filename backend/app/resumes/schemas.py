from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.resumes.content import ResumeContent


class SectionReportOut(BaseModel):
    section: str
    found: bool
    confidence: Literal["high", "medium", "low"]
    notes: list[str]


class ImportReportOut(BaseModel):
    parser_version: str
    file_kind: Literal["pdf", "docx", "txt"]
    pages: int | None
    characters: int
    truncated: bool
    headings_found: list[str]
    sections: list[SectionReportOut]
    warnings: list[str]


class ImportOut(BaseModel):
    id: uuid.UUID
    status: Literal["pending_review", "confirmed", "discarded"]
    filename: str
    created_at: datetime
    content: ResumeContent
    report: ImportReportOut
    has_master: bool


class ConfirmImportIn(BaseModel):
    content: ResumeContent
    title: str | None = Field(default=None, max_length=200)


class CreateResumeIn(BaseModel):
    title: str = Field(default="Master resume", min_length=1, max_length=200)
    content: ResumeContent = Field(default_factory=ResumeContent)


class UpdateContentIn(BaseModel):
    base_version: int = Field(ge=1)
    content: ResumeContent
    note: str | None = Field(default=None, max_length=500)


class RestoreIn(BaseModel):
    base_version: int = Field(ge=1)


class RenameIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class ResumeSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: Literal["master", "tailored"]
    status: Literal["active", "archived"]
    title: str
    current_version: int
    master_resume_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class ResumeDetailOut(ResumeSummaryOut):
    content: ResumeContent


class VersionMetaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    version: int
    source: Literal["upload", "edit", "restore", "tailoring"]
    note: str | None
    has_file: bool
    created_at: datetime


class VersionOut(VersionMetaOut):
    content: ResumeContent


class CheckOut(BaseModel):
    id: str
    title: str
    section: str
    status: Literal["pass", "warn", "fail"]
    detail: str
    weight: int


class AnalysisOut(BaseModel):
    resume_id: uuid.UUID
    version: int
    score: int = Field(ge=0, le=100)
    method_version: str
    checks: list[CheckOut]
