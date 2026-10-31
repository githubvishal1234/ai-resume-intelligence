from __future__ import annotations

import uuid

from sqlalchemy import JSON, ForeignKey, Index, Unicode, UnicodeText, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Story(TimestampMixin, Base):
    """A STAR interview story, usually started from one resume line and finished by the user."""

    __tablename__ = "stories"
    __table_args__ = (Index("ix_stories_owner_id_updated_at", "owner_id", "updated_at"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # The resume line it grew from, kept verbatim even if the resume changes later.
    source_line: Mapped[str] = mapped_column(UnicodeText, nullable=False, default="")
    source: Mapped[str] = mapped_column(Unicode(200), nullable=False, default="")
    title: Mapped[str] = mapped_column(Unicode(200), nullable=False)
    situation: Mapped[str] = mapped_column(UnicodeText, nullable=False, default="")
    task: Mapped[str] = mapped_column(UnicodeText, nullable=False, default="")
    action: Mapped[str] = mapped_column(UnicodeText, nullable=False, default="")
    result: Mapped[str] = mapped_column(UnicodeText, nullable=False, default="")
    themes: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
