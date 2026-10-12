from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class TailoringSession(TimestampMixin, Base):
    """Proposed changes for one job, computed from one master version. The master is only read."""

    __tablename__ = "tailoring_sessions"
    __table_args__ = (
        CheckConstraint("status in ('draft','finalized','discarded')", name="status_valid"),
        Index("ix_tailoring_sessions_owner_id_created_at", "owner_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    master_resume_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("resumes.id", ondelete="CASCADE"), nullable=False
    )
    base_version: Mapped[int] = mapped_column(Integer, nullable=False)
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft")
    method_version: Mapped[str] = mapped_column(String(32), nullable=False)
    result_resume_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("resumes.id", ondelete="SET NULL")
    )

    changes: Mapped[list[TailoringChange]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="TailoringChange.position",
    )


class TailoringChange(Base):
    __tablename__ = "tailoring_changes"
    __table_args__ = (
        CheckConstraint("decision in ('pending','accepted','rejected')", name="decision_valid"),
        UniqueConstraint("session_id", "position", name="uq_tailoring_changes_session_position"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tailoring_sessions.id", ondelete="CASCADE"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="rules")
    target_id: Mapped[str | None] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    original: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    proposed: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    edited: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    requirement_ids: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    evidence: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    flags: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    decision: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")

    session: Mapped[TailoringSession] = relationship(back_populates="changes")
