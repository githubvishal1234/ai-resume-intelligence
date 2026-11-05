from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, Unicode, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class JobMatch(Base):
    """A snapshot of matching one resume version against one job. Never updated in place."""

    __tablename__ = "job_matches"
    __table_args__ = (
        Index("ix_job_matches_owner_id_created_at", "owner_id", "created_at"),
        Index("ix_job_matches_job_id_created_at", "job_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    job_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("jobs.id"), nullable=False)
    resume_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("resumes.id"), nullable=False)
    resume_version: Mapped[int] = mapped_column(Integer, nullable=False)
    job_analyzer_version: Mapped[str] = mapped_column(Unicode(32), nullable=False)
    method_version: Mapped[str] = mapped_column(Unicode(32), nullable=False)
    overall: Mapped[int] = mapped_column(Integer, nullable=False)
    result: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.sysdatetimeoffset(), nullable=False
    )
