from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import JSON, ForeignKey, Index, Unicode, UnicodeText, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class CoverLetter(TimestampMixin, Base):
    """A cover letter drafted from a resume (and optionally a job), then edited by the user."""

    __tablename__ = "cover_letters"
    __table_args__ = (Index("ix_cover_letters_owner_id_updated_at", "owner_id", "updated_at"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # Kept if the resume or job is deleted: the letter is the user's text now.
    resume_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("resumes.id"))
    job_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("jobs.id"))
    title: Mapped[str] = mapped_column(Unicode(200), nullable=False)
    recipient_name: Mapped[str] = mapped_column(Unicode(200), nullable=False, default="")
    company: Mapped[str] = mapped_column(Unicode(200), nullable=False, default="")
    body: Mapped[str] = mapped_column(UnicodeText, nullable=False, default="")
    template: Mapped[str] = mapped_column(Unicode(32), nullable=False, default="classic")
    # The resume lines the draft quoted, with the requirement each one answers.
    evidence: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
