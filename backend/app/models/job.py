from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import JSON, CheckConstraint, ForeignKey, Index, Unicode, UnicodeText, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Job(TimestampMixin, Base):
    """A job description the user saved. The raw text is kept so analysis can be re-run."""

    __tablename__ = "jobs"
    __table_args__ = (
        CheckConstraint("source in ('paste','upload','url')", name="source_valid"),
        Index("ix_jobs_owner_id_created_at", "owner_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    source: Mapped[str] = mapped_column(Unicode(16), nullable=False)
    source_url: Mapped[str | None] = mapped_column(Unicode(2000))
    source_filename: Mapped[str | None] = mapped_column(Unicode(255))
    title: Mapped[str] = mapped_column(Unicode(200), nullable=False)
    company: Mapped[str | None] = mapped_column(Unicode(200))
    location: Mapped[str | None] = mapped_column(Unicode(200))
    raw_text: Mapped[str] = mapped_column(UnicodeText, nullable=False)
    analysis: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    analyzer_version: Mapped[str] = mapped_column(Unicode(32), nullable=False)
