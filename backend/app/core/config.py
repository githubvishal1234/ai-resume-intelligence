"""Application configuration. All values come from environment variables (see .env.example).

Nothing here selects an LLM vendor, email vendor, cloud or retention policy: those company
decisions are pending (docs/PRODUCTION_IMPLEMENTATION_PLAN.md, Decision Register).
"""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

_DEV_DB_PASSWORD = "Dev_only_Passw0rd"  # noqa: S105 - documented dev-only default


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    app_env: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"

    # SQL Server through Microsoft ODBC Driver 18 (install it on the host or in the image).
    database_url: str = (
        f"mssql+pyodbc://sa:{_DEV_DB_PASSWORD}@localhost:1433/resume_intel"
        "?driver=ODBC+Driver+18+for+SQL+Server&TrustServerCertificate=yes"
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
    # For reasoning models (gpt-oss on Groq, OpenAI o-series): how long they think before
    # answering. "low" is several times faster and cheaper. Empty = the provider's default.
    llm_reasoning_effort: Literal["low", "medium", "high"] | None = None
    # AI calls per user per UTC day (0 = no limit). Counted in the ai_usage table. This is the
    # full allowance: Pro users get it, and so does everyone while billing is not set up.
    ai_daily_limit_per_user: int = Field(default=100, ge=0)
    # Free plan allowance, applied only when billing is configured.
    ai_daily_limit_free: int = Field(default=5, ge=0)

    # --- Billing: Razorpay subscriptions. All five set => billing on; any missing => off. ---
    razorpay_key_id: str | None = None
    razorpay_key_secret: SecretStr | None = None
    razorpay_webhook_secret: SecretStr | None = None
    razorpay_plan_monthly: str | None = None
    razorpay_plan_yearly: str | None = None
    razorpay_api_base: str = "https://api.razorpay.com/v1"
    razorpay_timeout_seconds: float = Field(default=20, gt=0, le=120)

    # --- Email (D-07 provider pending). "smtp" works with any provider; "console" is dev-only.
    email_provider: str | None = None
    email_from: str | None = None
    # Public URL of the web app, used for links in emails (e.g. https://app.example.com).
    app_base_url: str | None = None
    smtp_host: str | None = None
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_security: Literal["starttls", "ssl", "none"] = "starttls"
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    smtp_timeout_seconds: float = Field(default=15, gt=0, le=120)
    password_reset_ttl_minutes: int = Field(default=30, ge=5, le=24 * 60)

    storage_backend: str = "local"
    storage_local_root: str = "./var/storage"
    # STORAGE_BACKEND=s3: any service with the S3 API (D-06 picks which). No vendor SDK.
    s3_endpoint_url: str | None = None
    s3_bucket: str | None = None
    s3_region: str = "us-east-1"
    s3_access_key_id: str | None = None
    s3_secret_access_key: SecretStr | None = None
    s3_addressing: Literal["path", "virtual"] = "path"
    s3_prefix: str = ""
    s3_timeout_seconds: float = Field(default=30, gt=0, le=300)
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
        "llm_provider",
        "llm_model",
        "llm_base_url",
        "llm_api_key",
        "llm_reasoning_effort",
        "email_provider",
        "email_from",
        "app_base_url",
        "smtp_host",
        "smtp_username",
        "smtp_password",
        "s3_endpoint_url",
        "s3_bucket",
        "s3_access_key_id",
        "s3_secret_access_key",
        "razorpay_key_id",
        "razorpay_key_secret",
        "razorpay_webhook_secret",
        "razorpay_plan_monthly",
        "razorpay_plan_yearly",
        mode="before",
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
            if (self.email_provider or "").lower() == "console":
                problems.append("EMAIL_PROVIDER=console is for development only")
            if self.storage_backend == "s3" and (self.s3_endpoint_url or "").startswith("http:"):
                problems.append("S3_ENDPOINT_URL must use https")
            if self.smtp_security == "none" and (self.email_provider or "").lower() == "smtp":
                problems.append("SMTP_SECURITY must be starttls or ssl")
            if (self.razorpay_key_id or "").startswith("rzp_test_"):
                problems.append("RAZORPAY_KEY_ID is a test-mode key")
            if not self.razorpay_api_base.startswith("https://"):
                problems.append("RAZORPAY_API_BASE must use https")
            if problems:
                raise ValueError("Unsafe production configuration: " + "; ".join(problems))
        return self

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
