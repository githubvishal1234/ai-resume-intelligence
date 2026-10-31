from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, Unicode, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AiUsage(Base):
    """One AI provider call. Holds counts and timings only, never prompt or answer text."""

    __tablename__ = "ai_usage"
    __table_args__ = (
        CheckConstraint("outcome in ('ok','error')", name="outcome_valid"),
        Index("ix_ai_usage_owner_created", "owner_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    feature: Mapped[str] = mapped_column(Unicode(64), nullable=False)
    provider: Mapped[str] = mapped_column(Unicode(32), nullable=False)
    model: Mapped[str] = mapped_column(Unicode(128), nullable=False)
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    outcome: Mapped[str] = mapped_column(Unicode(8), nullable=False)
    error_code: Mapped[str | None] = mapped_column(Unicode(64))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.sysdatetimeoffset(), nullable=False
    )
