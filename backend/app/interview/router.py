from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Request, status
from sqlalchemy.orm import Session

from app.auth.deps import CurrentAuth
from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.interview.schemas import (
    CreatePrepIn,
    FeedbackOut,
    PracticeAnswerOut,
    PracticeSessionOut,
    PracticeSessionSummaryOut,
    PrepDetailOut,
    PrepSummaryOut,
    SaveAnswerIn,
    StartPracticeIn,
)
from app.interview.service import InterviewService
from app.models import InterviewPrep, Job, PracticeSession, Resume

router = APIRouter(prefix="/interview", tags=["interview"])

QuestionId = Annotated[str, Path(pattern=r"^[0-9a-f]{12}$")]


def get_interview_service(
    request: Request,
    auth: CurrentAuth,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> InterviewService:
    return InterviewService(
        db, settings, auth.actor, request.scope.get("state", {}).get("request_id")
    )


Service = Annotated[InterviewService, Depends(get_interview_service)]


def _session_summary(s: PracticeSession) -> PracticeSessionSummaryOut:
    answered = [a for a in s.answers if a.question_id in s.question_ids and a.answer]
    ratings = [a.self_rating for a in s.answers if a.self_rating is not None]
    return PracticeSessionSummaryOut(
        id=s.id,
        status=s.status,
        question_count=len(s.question_ids),
        answered_count=len(answered),
        average_rating=round(sum(ratings) / len(ratings), 1) if ratings else None,
        created_at=s.created_at,
        completed_at=s.completed_at,
    )


def _prep_summary(service: InterviewService, prep: InterviewPrep) -> PrepSummaryOut:
    job = service.db.get(Job, prep.job_id)
    resume = service.db.get(Resume, prep.resume_id) if prep.resume_id else None
    assert job is not None
    return PrepSummaryOut(
        id=prep.id,
        job_id=job.id,
        job_title=job.title,
        company=job.company,
        resume_id=prep.resume_id,
        resume_title=resume.title if resume else None,
        resume_version=prep.resume_version,
        method_version=prep.method_version,
        question_count=len(prep.questions),
        session_count=len(prep.sessions),
        created_at=prep.created_at,
    )


def _prep_detail(service: InterviewService, prep: InterviewPrep) -> PrepDetailOut:
    return PrepDetailOut(
        **_prep_summary(service, prep).model_dump(),
        questions=service.questions(prep),
        sessions=[_session_summary(s) for s in prep.sessions],
    )


def _session(service: InterviewService, s: PracticeSession) -> PracticeSessionOut:
    by_id = {q.id: q for q in service.questions(s.prep)}
    job = service.db.get(Job, s.prep.job_id)
    assert job is not None
    return PracticeSessionOut(
        **_session_summary(s).model_dump(),
        prep_id=s.prep_id,
        job_title=job.title,
        questions=[by_id[q] for q in s.question_ids if q in by_id],
        answers=[
            PracticeAnswerOut(
                question_id=a.question_id,
                answer=a.answer,
                self_rating=a.self_rating,
                notes=a.notes,
                feedback=FeedbackOut.model_validate(a.feedback) if a.feedback else None,
                updated_at=a.updated_at,
            )
            for a in s.answers
        ],
    )


@router.get("/preps", response_model=list[PrepSummaryOut])
def list_preps(service: Service) -> list[PrepSummaryOut]:
    return [_prep_summary(service, p) for p in service.list_preps()]


@router.post("/preps", response_model=PrepDetailOut, status_code=status.HTTP_201_CREATED)
def create_prep(body: CreatePrepIn, service: Service) -> PrepDetailOut:
    return _prep_detail(service, service.create_prep(body.job_id, body.resume_id))


@router.get("/preps/{prep_id}", response_model=PrepDetailOut)
def get_prep(prep_id: uuid.UUID, service: Service) -> PrepDetailOut:
    return _prep_detail(service, service.get_prep(prep_id))


@router.delete("/preps/{prep_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_prep(prep_id: uuid.UUID, service: Service) -> None:
    service.delete_prep(prep_id)


@router.post(
    "/preps/{prep_id}/sessions",
    response_model=PracticeSessionOut,
    status_code=status.HTTP_201_CREATED,
)
def start_practice(
    prep_id: uuid.UUID, body: StartPracticeIn, service: Service
) -> PracticeSessionOut:
    return _session(service, service.start(prep_id, body.question_ids))


@router.get("/sessions/{session_id}", response_model=PracticeSessionOut)
def get_session(session_id: uuid.UUID, service: Service) -> PracticeSessionOut:
    return _session(service, service.get_session(session_id))


@router.put("/sessions/{session_id}/answers/{question_id}", response_model=PracticeSessionOut)
def save_answer(
    session_id: uuid.UUID, question_id: QuestionId, body: SaveAnswerIn, service: Service
) -> PracticeSessionOut:
    session = service.save_answer(
        session_id,
        question_id,
        answer=body.answer,
        self_rating=body.self_rating,
        notes=body.notes,
    )
    return _session(service, session)


@router.post(
    "/sessions/{session_id}/answers/{question_id}/evaluate", response_model=PracticeSessionOut
)
def evaluate_answer(
    session_id: uuid.UUID, question_id: QuestionId, service: Service
) -> PracticeSessionOut:
    return _session(service, service.evaluate(session_id, question_id))


@router.post("/sessions/{session_id}/complete", response_model=PracticeSessionOut)
def complete_practice(session_id: uuid.UUID, service: Service) -> PracticeSessionOut:
    return _session(service, service.complete(session_id))
