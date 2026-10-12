from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.interview.questions import Question


class CreatePrepIn(BaseModel):
    """Without `resume_id`, the newest tailored resume for the job is used, else the master."""

    job_id: uuid.UUID
    resume_id: uuid.UUID | None = None


class StartPracticeIn(BaseModel):
    """Without `question_ids`, every question in the prep is practiced, in order."""

    question_ids: list[str] | None = Field(default=None, min_length=1, max_length=100)


class SaveAnswerIn(BaseModel):
    answer: str = Field(default="", max_length=10_000)
    self_rating: int | None = Field(default=None, ge=1, le=5)
    notes: str = Field(default="", max_length=5_000)


class Feedback(BaseModel):
    """Structured feedback from the optional LLM evaluation."""

    score: int = Field(ge=1, le=5)
    strengths: list[str] = Field(default_factory=list, max_length=5)
    improvements: list[str] = Field(default_factory=list, max_length=5)


class FeedbackOut(Feedback):
    source: str


class PrepSummaryOut(BaseModel):
    id: uuid.UUID
    job_id: uuid.UUID
    job_title: str
    company: str | None
    resume_id: uuid.UUID | None
    resume_title: str | None
    resume_version: int
    method_version: str
    question_count: int
    session_count: int
    created_at: datetime


class PracticeSessionSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: Literal["in_progress", "completed"]
    question_count: int
    answered_count: int
    average_rating: float | None
    created_at: datetime
    completed_at: datetime | None


class PrepDetailOut(PrepSummaryOut):
    questions: list[Question]
    sessions: list[PracticeSessionSummaryOut]


class PracticeAnswerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    question_id: str
    answer: str
    self_rating: int | None
    notes: str
    feedback: FeedbackOut | None
    updated_at: datetime


class PracticeSessionOut(PracticeSessionSummaryOut):
    prep_id: uuid.UUID
    job_title: str
    questions: list[Question]
    answers: list[PracticeAnswerOut]
