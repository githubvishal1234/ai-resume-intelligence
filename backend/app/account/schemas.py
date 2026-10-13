from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class ProfileUpdate(BaseModel):
    display_name: str = Field(min_length=1, max_length=120)

    @field_validator("display_name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Display name cannot be blank.")
        return value


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=1, max_length=128)


class AccountDelete(BaseModel):
    password: str = Field(min_length=1, max_length=128)


class SignInOut(BaseModel):
    """One signed-in browser. The token itself is never returned."""

    id: uuid.UUID
    user_agent: str | None
    created_at: datetime
    last_seen_at: datetime
    current: bool


class RevokedOut(BaseModel):
    revoked: int
