"""Deleting one record and what depends on it.

SQL Server allows a table only one cascading path from any other table, so only the links to
`users.id` cascade (deleting an account clears everything in one statement). Every other link
is NO ACTION, and these helpers do what ON DELETE CASCADE / SET NULL used to: delete the
dependents, or detach them, before the record itself goes. Call them inside the caller's
transaction; they flush nothing and commit nothing.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.models import (
    Application,
    ApplicationEvent,
    CoverLetter,
    InterviewPrep,
    JobMatch,
    Notification,
    PracticeAnswer,
    PracticeSession,
    ProofTask,
    Resume,
    ResumeImport,
    ResumeVersion,
    TailoringChange,
    TailoringSession,
)


def _tailoring_sessions(db: Session, ids: Iterable[uuid.UUID]) -> None:
    ids = list(ids)
    if ids:
        db.execute(delete(TailoringChange).where(TailoringChange.session_id.in_(ids)))
        db.execute(delete(TailoringSession).where(TailoringSession.id.in_(ids)))


def interview_preps(db: Session, ids: Iterable[uuid.UUID]) -> None:
    ids = list(ids)
    if not ids:
        return
    sessions = select(PracticeSession.id).where(PracticeSession.prep_id.in_(ids))
    db.execute(delete(PracticeAnswer).where(PracticeAnswer.session_id.in_(sessions)))
    db.execute(delete(PracticeSession).where(PracticeSession.prep_id.in_(ids)))
    db.execute(delete(InterviewPrep).where(InterviewPrep.id.in_(ids)))


def application(db: Session, application_id: uuid.UUID) -> None:
    db.execute(delete(ApplicationEvent).where(ApplicationEvent.application_id == application_id))
    db.execute(delete(Notification).where(Notification.application_id == application_id))
    db.execute(delete(Application).where(Application.id == application_id))


def job(db: Session, job_id: uuid.UUID) -> None:
    """Dependents of a job; the caller deletes the job itself."""
    db.execute(update(Application).where(Application.job_id == job_id).values(job_id=None))
    db.execute(update(CoverLetter).where(CoverLetter.job_id == job_id).values(job_id=None))
    db.execute(update(ProofTask).where(ProofTask.job_id == job_id).values(job_id=None))
    db.execute(delete(JobMatch).where(JobMatch.job_id == job_id))
    _tailoring_sessions(
        db, db.scalars(select(TailoringSession.id).where(TailoringSession.job_id == job_id))
    )
    interview_preps(db, db.scalars(select(InterviewPrep.id).where(InterviewPrep.job_id == job_id)))


def resumes(db: Session, ids: Iterable[uuid.UUID]) -> None:
    """Dependents of these resumes (their tailored copies included); the caller deletes the
    resumes. Versions are deleted, never updated: the immutability trigger allows that."""
    ids = list(ids)
    if not ids:
        return
    for model in (Application, CoverLetter, InterviewPrep):
        db.execute(update(model).where(model.resume_id.in_(ids)).values(resume_id=None))
    db.execute(
        update(TailoringSession)
        .where(TailoringSession.result_resume_id.in_(ids))
        .values(result_resume_id=None)
    )
    db.execute(delete(JobMatch).where(JobMatch.resume_id.in_(ids)))
    _tailoring_sessions(
        db,
        db.scalars(select(TailoringSession.id).where(TailoringSession.master_resume_id.in_(ids))),
    )
    db.execute(delete(ResumeVersion).where(ResumeVersion.resume_id.in_(ids)))


def resume_files(db: Session, ids: Iterable[uuid.UUID]) -> None:
    """Dependents of these uploaded files; versions using them must already be gone."""
    ids = list(ids)
    if ids:
        db.execute(delete(ResumeImport).where(ResumeImport.file_id.in_(ids)))


def account(db: Session, user_id: uuid.UUID) -> None:
    """What deleting the user can't reach in one statement: rows without an owner column.

    Afterwards `DELETE FROM users` cascades through every owner link in one statement, and
    SQL Server checks the remaining NO ACTION links (between owned rows) only at its end.
    """
    resumes(db, db.scalars(select(Resume.id).where(Resume.owner_id == user_id)))
    apps = select(Application.id).where(Application.owner_id == user_id)
    db.execute(delete(ApplicationEvent).where(ApplicationEvent.application_id.in_(apps)))
    sessions = select(PracticeSession.id).where(PracticeSession.owner_id == user_id)
    db.execute(delete(PracticeAnswer).where(PracticeAnswer.session_id.in_(sessions)))
    _tailoring_sessions(
        db, db.scalars(select(TailoringSession.id).where(TailoringSession.owner_id == user_id))
    )
