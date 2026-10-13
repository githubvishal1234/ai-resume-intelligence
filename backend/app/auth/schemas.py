from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
    display_name: str = Field(min_length=1, max_length=120)

    @field_validator("display_name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Display name cannot be blank.")
        return value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str


class SessionOut(BaseModel):
    """`csrf_token` must be sent back in the X-CSRF-Token header on state-changing requests."""

    user: UserOut
    csrf_token: str


class AuthOptionsOut(BaseModel):
    """What the sign-in pages may offer. Public: no account information."""

    registration: bool
    password_reset: bool


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=1, max_length=128)
