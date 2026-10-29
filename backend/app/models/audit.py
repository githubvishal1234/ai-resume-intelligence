from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, CheckConstraint, DateTime, ForeignKey, Index, Unicode, Uuid, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AuditLog(Base):
    """Security-relevant events. `details` must never contain passwords, tokens, emails,
    resume text or job-description text."""

    __tablename__ = "audit_logs"
    __table_args__ = (
        CheckConstraint("outcome in ('success','failure')", name="outcome_valid"),
        Index("ix_audit_logs_actor_created", "actor_user_id", "created_at"),
        Index("ix_audit_logs_action_created", "action", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    action: Mapped[str] = mapped_column(Unicode(64), nullable=False)
    resource_type: Mapped[str | None] = mapped_column(Unicode(64))
    resource_id: Mapped[str | None] = mapped_column(Unicode(64))
    outcome: Mapped[str] = mapped_column(Unicode(16), nullable=False)
    request_id: Mapped[str | None] = mapped_column(Unicode(64))
    details: Mapped[dict[str, Any]] = mapped_column(
        JSON, nullable=False, server_default=text("'{}'")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.sysdatetimeoffset(), nullable=False
    )
