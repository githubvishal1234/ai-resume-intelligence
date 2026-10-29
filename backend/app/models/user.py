from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, DateTime, Unicode, UnicodeText, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.session import UserSession


class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        # A case-sensitive collation: SQL Server compares case-insensitively by default.
        CheckConstraint(
            "email = LOWER(email) COLLATE Latin1_General_CS_AS", name="email_lowercase"
        ),
        CheckConstraint("LEN(display_name) > 0", name="display_name_not_empty"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(Unicode(320), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(UnicodeText, nullable=False)
    display_name: Mapped[str] = mapped_column(Unicode(120), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("1"))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    sessions: Mapped[list[UserSession]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
