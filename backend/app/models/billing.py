from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Unicode,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

# Razorpay subscription states. A user is on Pro while their subscription is in PRO_STATUSES.
SUBSCRIPTION_STATUSES = (
    "created",
    "authenticated",
    "active",
    "pending",
    "halted",
    "cancelled",
    "completed",
    "expired",
    "paused",
)
PRO_STATUSES = ("authenticated", "active", "pending")


class Subscription(TimestampMixin, Base):
    """A Pro subscription. Holds provider ids and state only, never payment details."""

    __tablename__ = "subscriptions"
    __table_args__ = (
        CheckConstraint("interval in ('monthly','yearly')", name="interval_valid"),
        CheckConstraint(
            "status in (" + ",".join(f"'{s}'" for s in SUBSCRIPTION_STATUSES) + ")",
            name="status_valid",
        ),
        UniqueConstraint("provider", "provider_subscription_id", name="provider_subscription"),
        Index("ix_subscriptions_owner", "owner_id"),
        # At most one live Pro subscription per user.
        Index(
            "uq_subscriptions_one_live",
            "owner_id",
            unique=True,
            mssql_where=text("status in ('authenticated','active','pending')"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    provider: Mapped[str] = mapped_column(Unicode(16), nullable=False, default="razorpay")
    provider_subscription_id: Mapped[str] = mapped_column(Unicode(64), nullable=False)
    interval: Mapped[str] = mapped_column(Unicode(8), nullable=False)
    status: Mapped[str] = mapped_column(Unicode(16), nullable=False, default="created")
    current_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancel_at_period_end: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("0"), default=False
    )
    # Time of the newest provider event applied; older events (out of order) are not applied.
    last_event_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class BillingEvent(Base):
    """A received webhook, kept for deduplication and audit. Only ids, type and status are
    stored: the raw payload can carry the payer's contact details."""

    __tablename__ = "billing_events"
    __table_args__ = (UniqueConstraint("provider", "event_id", name="provider_event"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    provider: Mapped[str] = mapped_column(Unicode(16), nullable=False, default="razorpay")
    event_id: Mapped[str] = mapped_column(Unicode(64), nullable=False)
    event_type: Mapped[str] = mapped_column(Unicode(64), nullable=False)
    provider_subscription_id: Mapped[str | None] = mapped_column(Unicode(64))
    status: Mapped[str | None] = mapped_column(Unicode(16))
    applied: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.sysdatetimeoffset(), nullable=False
    )
