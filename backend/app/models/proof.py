from __future__ import annotations

import uuid

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    Unicode,
    UnicodeText,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

PROOF_KINDS = ("project", "certification", "writeup")
PROOF_STATUSES = ("todo", "doing", "done")


class ProofTask(TimestampMixin, Base):
    """A piece of work the user plans to do to create real evidence for one missing skill.

    One task per skill per user: the point is to close the gap, not to collect plans.
    """

    __tablename__ = "proof_tasks"
    __table_args__ = (
        CheckConstraint("kind in ('project','certification','writeup')", name="kind_valid"),
        CheckConstraint("status in ('todo','doing','done')", name="status_valid"),
        UniqueConstraint("owner_id", "skill", name="owner_skill"),
        Index("ix_proof_tasks_owner_id_updated_at", "owner_id", "updated_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # The job that surfaced the gap; kept if the job is deleted, the plan still stands.
    job_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("jobs.id"))
    skill: Mapped[str] = mapped_column(Unicode(100), nullable=False)
    kind: Mapped[str] = mapped_column(Unicode(16), nullable=False)
    title: Mapped[str] = mapped_column(Unicode(200), nullable=False)
    plan: Mapped[str] = mapped_column(UnicodeText, nullable=False, default="")
    status: Mapped[str] = mapped_column(Unicode(8), nullable=False, default="todo")
