"""Application configuration. All values come from environment variables (see .env.example).

Nothing here selects an LLM vendor, email vendor, cloud or retention policy: those company
decisions are pending (docs/PRODUCTION_IMPLEMENTATION_PLAN.md, Decision Register).
"""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

_DEV_DB_PASSWORD = "dev_only_password"  # noqa: S105 - documented dev-only default


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    app_env: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"

    database_url: str = (
        f"postgresql+psycopg://resume_app:{_DEV_DB_PASSWORD}@localhost:5432/resume_intel"
    )
    db_pool_size: int = Field(default=5, ge=1, le=100)

    # CORS: only needed if the SPA is served from a different origin than the API.
    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=list)

    # Sessions (engineering defaults for security; not business rules)
    session_cookie_name: str = "ri_session"
    session_cookie_secure: bool = False
    session_absolute_ttl_hours: int = Field(default=24 * 7, ge=1)
    session_idle_ttl_hours: int = Field(default=24, ge=1)
    registration_enabled: bool = True
    password_min_length: int = Field(default=10, ge=8)

    # Rate limits (per process; see docs/SECURITY.md for the single-process limitation)
    auth_rate_limit_attempts: int = Field(default=10, ge=1)
    auth_rate_limit_window_seconds: int = Field(default=300, ge=1)

    # --- AI provider (D-03: openai or groq). Empty LLM_PROVIDER => "not configured" ---
    llm_provider: str | None = None
    llm_model: str | None = None
    llm_base_url: str | None = None
    llm_api_key: SecretStr | None = None
    llm_timeout_seconds: float = Field(default=60, gt=0, le=600)
    llm_max_retries: int = Field(default=2, ge=0, le=5)
    llm_response_format: Literal["json_schema", "json_object"] = "json_schema"
    llm_min_output_tokens: int = Field(default=0, ge=0, le=32_000)

    # --- Other pending company decisions: abstractions only ---
    email_provider: str | None = None

    storage_backend: str = "local"
    storage_local_root: str = "./var/storage"
    max_upload_bytes: int = Field(default=10 * 1024 * 1024, ge=1)

    # Requests slower than this are logged at WARNING as "slow_request" (0 disables).
    slow_request_ms: int = Field(default=1000, ge=0)

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [part.strip() for part in value.split(",") if part.strip()]
        return value

    @field_validator(
        "llm_provider", "llm_model", "llm_base_url", "llm_api_key", "email_provider", mode="before"
    )
    @classmethod
    def _empty_to_none(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @model_validator(mode="after")
    def _production_guards(self) -> Settings:
        if self.app_env == "production":
            problems: list[str] = []
            if _DEV_DB_PASSWORD in self.database_url:
                problems.append("DATABASE_URL uses the development password")
            if not self.session_cookie_secure:
                problems.append("SESSION_COOKIE_SECURE must be true")
            if "*" in self.cors_origins:
                problems.append("CORS_ORIGINS must not contain '*'")
            if problems:
                raise ValueError("Unsafe production configuration: " + "; ".join(problems))
        return self

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
