from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class InterviewPrep(TimestampMixin, Base):
    """A question bank for one job, built from one resume version. Both are only read."""

    __tablename__ = "interview_preps"
    __table_args__ = (Index("ix_interview_preps_owner_id_created_at", "owner_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False
    )
    resume_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("resumes.id", ondelete="SET NULL")
    )
    resume_version: Mapped[int] = mapped_column(Integer, nullable=False)
    method_version: Mapped[str] = mapped_column(String(32), nullable=False)
    questions: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False)

    sessions: Mapped[list[PracticeSession]] = relationship(
        back_populates="prep",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="PracticeSession.created_at.desc()",
    )


class PracticeSession(Base):
    __tablename__ = "practice_sessions"
    __table_args__ = (
        CheckConstraint("status in ('in_progress','completed')", name="status_valid"),
        Index("ix_practice_sessions_prep_id", "prep_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    prep_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("interview_preps.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="in_progress")
    question_ids: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    prep: Mapped[InterviewPrep] = relationship(back_populates="sessions")
    answers: Mapped[list[PracticeAnswer]] = relationship(
        back_populates="session", cascade="all, delete-orphan", passive_deletes=True
    )


class PracticeAnswer(Base):
    __tablename__ = "practice_answers"
    __table_args__ = (
        CheckConstraint(
            "self_rating IS NULL OR (self_rating BETWEEN 1 AND 5)", name="self_rating_range"
        ),
        UniqueConstraint(
            "session_id", "question_id", name="uq_practice_answers_session_id_question_id"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("practice_sessions.id", ondelete="CASCADE"), nullable=False
    )
    question_id: Mapped[str] = mapped_column(String(40), nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False, default="")
    self_rating: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Set only by the optional LLM evaluation; `source` inside records provider and model.
    feedback: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    session: Mapped[PracticeSession] = relationship(back_populates="answers")
