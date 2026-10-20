from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.matching.matcher import Status

ProofKind = Literal["project", "certification", "writeup"]
ProofStatus = Literal["todo", "doing", "done"]
SkillName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class SuggestionOut(BaseModel):
    kind: ProofKind
    title: str
    plan: list[str]


class SuggestionsOut(BaseModel):
    method_version: str
    skill: str
    suggestions: list[SuggestionOut]


class CreateProofIn(BaseModel):
    skill: SkillName
    kind: ProofKind = "project"
    job_id: uuid.UUID | None = None


class UpdateProofIn(BaseModel):
    title: (
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
        | None
    ) = None
    plan: str | None = Field(default=None, max_length=5000)
    status: ProofStatus | None = None


class ProofOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    skill: str
    kind: ProofKind
    title: str
    plan: str
    status: ProofStatus
    job_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    # How the master resume shows this skill right now; None without a master resume.
    evidence_status: Status | None = None
