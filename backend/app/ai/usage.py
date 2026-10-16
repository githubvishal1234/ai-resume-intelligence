"""AI call metering: every call is recorded and a daily per-user limit is enforced.

Usage rows are written in their own short transaction, so a call is counted even when the
request that made it fails afterwards. The limit check and the call are not atomic; two calls
racing at the limit can both pass, which is acceptable for a cost guard.
"""

from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from datetime import time as dtime

from pydantic import BaseModel
from sqlalchemy import func, select

from app.ai.provider import LLMCapabilities, LLMMessage, LLMProvider, StructuredResult
from app.billing.service import ai_daily_limit
from app.core.config import Settings
from app.core.errors import AppError
from app.db.session import get_sessionmaker
from app.models import AiUsage

logger = logging.getLogger(__name__)


class AiDailyLimitReached(AppError):
    status_code = 429
    code = "AI_DAILY_LIMIT_REACHED"
    message = "You have used all of today's AI requests. They reset at midnight UTC."


class PlanUpgradeRequired(AppError):
    status_code = 402
    code = "PLAN_UPGRADE_REQUIRED"
    message = (
        "You have used today's free AI requests. Upgrade to Pro for more, or try again after "
        "midnight UTC."
    )


@dataclass(frozen=True)
class UsageToday:
    used: int
    limit: int  # 0 means no limit
    resets_at: datetime
    free_plan: bool = False  # true when the Free allowance applies (billing is set up)

    @property
    def remaining(self) -> int | None:
        return None if self.limit == 0 else max(self.limit - self.used, 0)


def _day_start(now: datetime) -> datetime:
    return datetime.combine(now.date(), dtime.min, tzinfo=UTC)


def usage_today(owner_id: uuid.UUID, settings: Settings) -> UsageToday:
    now = datetime.now(UTC)
    start = _day_start(now)
    with get_sessionmaker()() as db:
        used = db.scalar(
            select(func.count())
            .select_from(AiUsage)
            .where(AiUsage.owner_id == owner_id, AiUsage.created_at >= start)
        )
        limit, free_plan = ai_daily_limit(db, owner_id, settings)
    return UsageToday(int(used or 0), limit, start + timedelta(days=1), free_plan)


def _record(row: AiUsage) -> None:
    try:
        with get_sessionmaker()() as db:
            db.add(row)
            db.commit()
    except Exception:  # pragma: no cover - metering must never break the feature itself
        logger.exception("ai_usage_record_failed")


class MeteredProvider(LLMProvider):
    """Wraps a provider for one user and one feature."""

    def __init__(
        self, inner: LLMProvider, owner_id: uuid.UUID, feature: str, settings: Settings
    ) -> None:
        self.inner = inner
        self.name = inner.name
        self.owner_id = owner_id
        self.feature = feature
        self.settings = settings

    @property
    def model(self) -> str:
        return self.inner.model

    @property
    def capabilities(self) -> LLMCapabilities:
        return self.inner.capabilities

    def generate_structured[T: BaseModel](
        self, schema: type[T], messages: list[LLMMessage], *, max_output_tokens: int | None = None
    ) -> StructuredResult[T]:
        today = usage_today(self.owner_id, self.settings)
        if today.remaining == 0:
            raise PlanUpgradeRequired() if today.free_plan else AiDailyLimitReached()
        started = time.monotonic()
        try:
            result = self.inner.generate_structured(
                schema, messages, max_output_tokens=max_output_tokens
            )
        except AppError as exc:
            self._log("error", started, error_code=exc.code)
            raise
        except Exception:
            self._log("error", started, error_code="UNEXPECTED")
            raise
        self._log(
            "ok",
            started,
            model=result.model,
            input_tokens=result.usage.input_tokens,
            output_tokens=result.usage.output_tokens,
        )
        return result

    def _log(
        self,
        outcome: str,
        started: float,
        *,
        model: str | None = None,
        input_tokens: int | None = None,
        output_tokens: int | None = None,
        error_code: str | None = None,
    ) -> None:
        _record(
            AiUsage(
                owner_id=self.owner_id,
                feature=self.feature,
                provider=self.inner.name,
                model=(model or self.inner.model)[:128],
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                latency_ms=int((time.monotonic() - started) * 1000),
                outcome=outcome,
                error_code=error_code,
            )
        )


def metered(
    provider: LLMProvider, owner_id: uuid.UUID, feature: str, settings: Settings
) -> LLMProvider:
    return MeteredProvider(provider, owner_id, feature, settings)
