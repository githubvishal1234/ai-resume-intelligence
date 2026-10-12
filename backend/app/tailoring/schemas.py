from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.matching.matcher import EvidenceRef
from app.resumes.content import ResumeContent
from app.tailoring.factcheck import FactFlag


class CreateTailoringIn(BaseModel):
    job_id: uuid.UUID


class DecisionIn(BaseModel):
    decision: Literal["pending", "accepted", "rejected"]
    # Only for editable changes (the summary): the user's own wording.
    edited_text: str | None = Field(default=None, max_length=5000)


class FinalizeIn(BaseModel):
    title: str | None = Field(default=None, max_length=200)


class RequirementRef(BaseModel):
    id: str
    text: str
    tier: str


class ChangeOut(BaseModel):
    id: uuid.UUID
    position: int
    kind: str
    source: Literal["rules", "llm"]
    target_id: str | None
    title: str
    reason: str
    original: dict[str, Any]
    proposed: dict[str, Any]
    edited: dict[str, Any] | None
    editable: bool
    requirements: list[RequirementRef]
    evidence: list[EvidenceRef]
    flags: list[FactFlag]
    decision: Literal["pending", "accepted", "rejected"]


class AiStatusOut(BaseModel):
    configured: bool
    reason: str | None


class TailoringSessionSummaryOut(BaseModel):
    id: uuid.UUID
    job_id: uuid.UUID
    job_title: str
    job_company: str | None
    master_resume_id: uuid.UUID
    base_version: int
    status: Literal["draft", "finalized", "discarded"]
    result_resume_id: uuid.UUID | None
    accepted: int
    total: int
    created_at: datetime


class TailoringSessionOut(TailoringSessionSummaryOut):
    method_version: str
    # The master moved on since these proposals were computed (they still apply to base_version).
    master_current_version: int
    changes: list[ChangeOut]
    preview: ResumeContent
    ai: AiStatusOut
