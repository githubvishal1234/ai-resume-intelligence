from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.ai.usage import usage_today
from app.auth.deps import CurrentAuth
from app.core.config import Settings, get_settings

router = APIRouter(prefix="/ai", tags=["ai"])


class AiUsageOut(BaseModel):
    used_today: int
    daily_limit: int  # 0 means no limit
    remaining: int | None  # null when there is no limit
    resets_at: datetime


@router.get("/usage", response_model=AiUsageOut)
def get_usage(
    auth: CurrentAuth, settings: Annotated[Settings, Depends(get_settings)]
) -> AiUsageOut:
    today = usage_today(auth.actor.user_id, settings)
    return AiUsageOut(
        used_today=today.used,
        daily_limit=today.limit,
        remaining=today.remaining,
        resets_at=today.resets_at,
    )
