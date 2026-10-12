from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.auth.deps import CurrentAuth
from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.jobs.analyzer import JobAnalysis
from app.matching.matcher import EvidenceRef
from app.models import Job, Resume, TailoringSession
from app.tailoring.proposer import EDITABLE_KINDS
from app.tailoring.schemas import (
    AiStatusOut,
    BulletOut,
    ChangeOut,
    CreateTailoringIn,
    DecisionIn,
    FinalizeIn,
    RequirementRef,
    RewriteBulletIn,
    TailoringSessionOut,
    TailoringSessionSummaryOut,
)
from app.tailoring.service import TailoringService, flags_of

router = APIRouter(prefix="/tailoring", tags=["tailoring"])


def get_tailoring_service(
    request: Request,
    auth: CurrentAuth,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> TailoringService:
    return TailoringService(
        db, settings, auth.actor, request.scope.get("state", {}).get("request_id")
    )


Service = Annotated[TailoringService, Depends(get_tailoring_service)]


def _summary(service: TailoringService, row: TailoringSession) -> TailoringSessionSummaryOut:
    job = service.db.get(Job, row.job_id)
    assert job is not None
    return TailoringSessionSummaryOut(
        id=row.id,
        job_id=row.job_id,
        job_title=job.title,
        job_company=job.company,
        master_resume_id=row.master_resume_id,
        base_version=row.base_version,
        status=row.status,
        result_resume_id=row.result_resume_id,
        accepted=sum(1 for c in row.changes if c.decision == "accepted"),
        total=len(row.changes),
        created_at=row.created_at,
    )


def _out(service: TailoringService, row: TailoringSession) -> TailoringSessionOut:
    job = service.db.get(Job, row.job_id)
    master = service.db.get(Resume, row.master_resume_id)
    assert job is not None and master is not None
    requirements = {r.id: r for r in JobAnalysis.model_validate(job.analysis).requirements}
    configured, reason = service.ai()
    changes = [
        ChangeOut(
            id=c.id,
            position=c.position,
            kind=c.kind,
            source=c.source,
            target_id=c.target_id,
            title=c.title,
            reason=c.reason,
            original=c.original,
            proposed=c.proposed,
            edited=c.edited,
            editable=c.kind in EDITABLE_KINDS,
            requirements=[
                RequirementRef(id=r.id, text=r.text, tier=r.tier)
                for rid in c.requirement_ids
                if (r := requirements.get(rid))
            ],
            evidence=[EvidenceRef.model_validate(e) for e in c.evidence],
            flags=flags_of(c),
            decision=c.decision,
        )
        for c in row.changes
    ]
    master_content = service.base_content(row)
    rewrites = {
        (c.target_id, c.original.get("text")): c.id
        for c in row.changes
        if c.kind == "rewrite_bullet"
    }
    bullets = [
        BulletOut(
            experience_id=e.id,
            role=" at ".join(p for p in (e.title, e.company) if p) or "Experience",
            index=i,
            text=b,
            change_id=rewrites.get((e.id, b)),
        )
        for e in master_content.experience
        for i, b in enumerate(e.bullets)
    ]
    return TailoringSessionOut(
        **_summary(service, row).model_dump(),
        method_version=row.method_version,
        master_current_version=master.current_version,
        changes=changes,
        preview=service.preview(row),
        bullets=bullets,
        ai=AiStatusOut(configured=configured, reason=reason),
    )


@router.get("", response_model=list[TailoringSessionSummaryOut])
def list_sessions(service: Service) -> list[TailoringSessionSummaryOut]:
    return [_summary(service, r) for r in service.list_sessions()]


@router.post("", response_model=TailoringSessionOut, status_code=status.HTTP_201_CREATED)
def create_session(body: CreateTailoringIn, service: Service) -> TailoringSessionOut:
    return _out(service, service.create(body.job_id))


@router.get("/{session_id}", response_model=TailoringSessionOut)
def get_session(session_id: uuid.UUID, service: Service) -> TailoringSessionOut:
    return _out(service, service.get(session_id))


@router.post("/{session_id}/changes/{change_id}/decision", response_model=TailoringSessionOut)
def decide(
    session_id: uuid.UUID, change_id: uuid.UUID, body: DecisionIn, service: Service
) -> TailoringSessionOut:
    return _out(service, service.decide(session_id, change_id, body.decision, body.edited_text))


@router.post("/{session_id}/changes/{change_id}/rewrite", response_model=TailoringSessionOut)
def rewrite(session_id: uuid.UUID, change_id: uuid.UUID, service: Service) -> TailoringSessionOut:
    return _out(service, service.rewrite(session_id, change_id))


@router.post("/{session_id}/bullets/rewrite", response_model=TailoringSessionOut)
def rewrite_bullet(
    session_id: uuid.UUID, body: RewriteBulletIn, service: Service
) -> TailoringSessionOut:
    return _out(service, service.rewrite_bullet(session_id, body.experience_id, body.bullet_index))


@router.post("/{session_id}/finalize", response_model=TailoringSessionOut)
def finalize(session_id: uuid.UUID, body: FinalizeIn, service: Service) -> TailoringSessionOut:
    return _out(service, service.finalize(session_id, body.title))


@router.post("/{session_id}/discard", status_code=status.HTTP_204_NO_CONTENT)
def discard(session_id: uuid.UUID, service: Service) -> None:
    service.discard(session_id)
