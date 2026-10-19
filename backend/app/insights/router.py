from __future__ import annotations

from dataclasses import asdict
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.deps import CurrentAuth
from app.db.session import get_db
from app.insights.analysis import MARKET_VERSION, MIN_SAMPLE, OUTCOMES_VERSION, Funnel, Group
from app.insights.schemas import FunnelOut, GroupOut, MarketOut, OutcomesOut, SkillDemandOut
from app.insights.service import InsightsService

router = APIRouter(prefix="/insights", tags=["insights"])


def get_insights_service(
    auth: CurrentAuth, db: Annotated[Session, Depends(get_db)]
) -> InsightsService:
    return InsightsService(db, auth.actor)


Service = Annotated[InsightsService, Depends(get_insights_service)]


def _funnel(f: Funnel) -> FunnelOut:
    return FunnelOut(
        sent=f.sent,
        responded=f.responded,
        interviewed=f.interviewed,
        offers=f.offers,
        response_rate=f.rate(f.responded),
        interview_rate=f.rate(f.interviewed),
    )


def _group(g: Group) -> GroupOut:
    return GroupOut(label=g.label, funnel=_funnel(g.funnel), enough_data=g.enough)


@router.get("/outcomes", response_model=OutcomesOut)
def outcomes(service: Service) -> OutcomesOut:
    o = service.outcomes()
    return OutcomesOut(
        method_version=OUTCOMES_VERSION,
        min_sample=MIN_SAMPLE,
        total=_funnel(o.total),
        by_resume=[_group(g) for g in o.by_resume],
        by_match=[_group(g) for g in o.by_match],
        median_days_to_response=o.median_days_to_response,
        unsent=o.unsent,
    )


@router.get("/market", response_model=MarketOut)
def market(service: Service) -> MarketOut:
    m, has_master = service.market()
    return MarketOut(
        method_version=MARKET_VERSION,
        jobs_analyzed=m.jobs_analyzed,
        has_master=has_master,
        coverage=m.coverage,
        top_gap=SkillDemandOut(**asdict(m.top_gap)) if m.top_gap else None,
        skills=[SkillDemandOut(**asdict(s)) for s in m.skills],
    )
