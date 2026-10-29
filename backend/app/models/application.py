from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Unicode,
    UnicodeText,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

APPLICATION_STATUSES = (
    "saved",
    "applied",
    "screening",
    "interviewing",
    "offer",
    "accepted",
    "rejected",
    "withdrawn",
)
CLOSED_STATUSES = frozenset({"accepted", "rejected", "withdrawn"})
_STATUS_SQL = ",".join(f"'{s}'" for s in APPLICATION_STATUSES)


class Application(TimestampMixin, Base):
    """One job the user is pursuing. Links to the job and the exact resume version sent."""

    __tablename__ = "applications"
    __table_args__ = (
        CheckConstraint(f"status in ({_STATUS_SQL})", name="status_valid"),
        CheckConstraint(
            "resume_version IS NULL OR resume_id IS NOT NULL", name="version_needs_resume"
        ),
        Index("ix_applications_owner_id_updated_at", "owner_id", "updated_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    job_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("jobs.id"))
    resume_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("resumes.id"))
    resume_version: Mapped[int | None] = mapped_column(Integer)
    company: Mapped[str] = mapped_column(Unicode(200), nullable=False)
    role: Mapped[str] = mapped_column(Unicode(200), nullable=False)
    url: Mapped[str | None] = mapped_column(Unicode(2000))
    status: Mapped[str] = mapped_column(Unicode(16), nullable=False, default="saved")
    applied_on: Mapped[date | None] = mapped_column(Date)
    follow_up_on: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str] = mapped_column(UnicodeText, nullable=False, default="")

    events: Mapped[list[ApplicationEvent]] = relationship(
        back_populates="application",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ApplicationEvent.created_at.desc()",
    )


class ApplicationEvent(Base):
    """Append-only history of an application: creation, status moves, edits and notes."""

    __tablename__ = "application_events"
    __table_args__ = (
        CheckConstraint("kind in ('created','status','edited','note')", name="kind_valid"),
        Index("ix_application_events_application_id_created_at", "application_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    application_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("applications.id"), nullable=False
    )
    kind: Mapped[str] = mapped_column(Unicode(16), nullable=False)
    from_status: Mapped[str | None] = mapped_column(Unicode(16))
    to_status: Mapped[str | None] = mapped_column(Unicode(16))
    fields: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    note: Mapped[str | None] = mapped_column(UnicodeText)
    # Set per row, not per transaction, so events written in one request keep their order.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.sysdatetimeoffset(),
        nullable=False,
    )

    application: Mapped[Application] = relationship(back_populates="events")


class Notification(Base):
    """An in-app notification. `dedupe_key` makes generated reminders idempotent."""

    __tablename__ = "notifications"
    __table_args__ = (
        CheckConstraint("kind in ('follow_up_due')", name="kind_valid"),
        UniqueConstraint("owner_id", "dedupe_key", name="uq_notifications_owner_id_dedupe_key"),
        Index("ix_notifications_owner_id_created_at", "owner_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    application_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("applications.id"))
    kind: Mapped[str] = mapped_column(Unicode(32), nullable=False)
    dedupe_key: Mapped[str] = mapped_column(Unicode(120), nullable=False)
    title: Mapped[str] = mapped_column(Unicode(300), nullable=False)
    body: Mapped[str] = mapped_column(UnicodeText, nullable=False, default="")
    link: Mapped[str | None] = mapped_column(Unicode(300))
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.sysdatetimeoffset(), nullable=False
    )
