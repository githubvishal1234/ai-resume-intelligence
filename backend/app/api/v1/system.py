from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.ai.registry import ai_status
from app.auth.deps import CurrentAuth
from app.benchmarks.base import get_benchmark_provider
from app.core.config import Settings, get_settings
from app.jobs.sources import registered_adapters
from app.mail.base import email_status

router = APIRouter(prefix="/system", tags=["system"])


class AiCapability(BaseModel):
    configured: bool
    provider: str | None
    model: str | None
    reason: str | None


class EmailCapability(BaseModel):
    configured: bool


class StorageCapability(BaseModel):
    backend: str


class BenchmarkCapability(BaseModel):
    available: bool


class JobSourcesCapability(BaseModel):
    external_adapters: list[str]


class CapabilitiesOut(BaseModel):
    """What this deployment can actually do. The UI uses this to show honest
    'not configured' states instead of pretending integrations exist."""

    ai: AiCapability
    email: EmailCapability
    storage: StorageCapability
    benchmarks: BenchmarkCapability
    job_sources: JobSourcesCapability


@router.get("/capabilities", response_model=CapabilitiesOut)
def capabilities(
    _: CurrentAuth, settings: Annotated[Settings, Depends(get_settings)]
) -> CapabilitiesOut:
    ai = ai_status(settings)
    return CapabilitiesOut(
        ai=AiCapability(
            configured=ai.configured, provider=ai.provider, model=ai.model, reason=ai.reason
        ),
        email=EmailCapability(configured=email_status(settings).configured),
        storage=StorageCapability(backend=settings.storage_backend),
        benchmarks=BenchmarkCapability(available=get_benchmark_provider().available),
        job_sources=JobSourcesCapability(
            external_adapters=[a.source_id for a in registered_adapters()]
        ),
    )
