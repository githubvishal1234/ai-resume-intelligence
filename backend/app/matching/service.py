"""Match snapshots. Matching only reads the resume and the job; it never changes either."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.access import Actor, ensure_access
from app.core.errors import AppError, NotFound
from app.jobs.analyzer import JobAnalysis
from app.matching.matcher import METHOD_VERSION, match
from app.models import Job, JobMatch, Resume, ResumeVersion
from app.resumes.content import ResumeContent


class MasterResumeRequired(AppError):
    status_code = 422
    code = "MASTER_RESUME_REQUIRED"
    message = "Add your master resume first, then match it against this job."


class MatchService:
    def __init__(self, db: Session, actor: Actor) -> None:
        self.db = db
        self.actor = actor

    def _owned_job(self, job_id: uuid.UUID) -> Job:
        job = self.db.get(Job, job_id)
        if job is None:
            raise NotFound()
        ensure_access(self.actor, job.owner_id)
        return job

    def _resume(self, resume_id: uuid.UUID | None) -> Resume:
        if resume_id is None:
            resume = self.db.scalar(
                select(Resume).where(
                    Resume.owner_id == self.actor.user_id,
                    Resume.kind == "master",
                    Resume.status == "active",
                )
            )
            if resume is None:
                raise MasterResumeRequired()
            return resume
        found = self.db.get(Resume, resume_id)
        if found is None:
            raise NotFound()
        ensure_access(self.actor, found.owner_id)
        return found

    def create(
        self, job_id: uuid.UUID, resume_id: uuid.UUID | None
    ) -> tuple[JobMatch, Job, Resume]:
        job = self._owned_job(job_id)
        resume = self._resume(resume_id)
        version = self.db.scalar(
            select(ResumeVersion).where(
                ResumeVersion.resume_id == resume.id,
                ResumeVersion.version == resume.current_version,
            )
        )
        if version is None:
            raise NotFound()
        result = match(
            ResumeContent.model_validate(version.content), JobAnalysis.model_validate(job.analysis)
        )
        row = JobMatch(
            owner_id=self.actor.user_id,
            job_id=job.id,
            resume_id=resume.id,
            resume_version=version.version,
            job_analyzer_version=job.analyzer_version,
            method_version=METHOD_VERSION,
            overall=result.overall,
            result=result.model_dump(mode="json"),
        )
        self.db.add(row)
        self.db.commit()
        return row, job, resume

    def latest(self, job_id: uuid.UUID) -> tuple[JobMatch, Job, Resume] | None:
        job = self._owned_job(job_id)
        row = self.db.scalar(
            select(JobMatch)
            .where(JobMatch.job_id == job.id)
            .order_by(JobMatch.created_at.desc())
            .limit(1)
        )
        if row is None:
            return None
        resume = self.db.get(Resume, row.resume_id)
        if resume is None:  # pragma: no cover - cascades delete matches with their resume
            raise NotFound()
        return row, job, resume

    def latest_per_job(self) -> list[tuple[JobMatch, Job, Resume]]:
        rows = self.db.execute(
            select(JobMatch, Job, Resume)
            .join(Job, Job.id == JobMatch.job_id)
            .join(Resume, Resume.id == JobMatch.resume_id)
            .where(JobMatch.owner_id == self.actor.user_id)
            .order_by(JobMatch.created_at.desc())
        ).all()
        seen: set[uuid.UUID] = set()
        out: list[tuple[JobMatch, Job, Resume]] = []
        for m, j, r in rows:
            if j.id not in seen:
                seen.add(j.id)
                out.append((m, j, r))
        return out


def is_stale(row: JobMatch, job: Job, resume: Resume) -> bool:
    return (
        resume.current_version != row.resume_version
        or job.analyzer_version != row.job_analyzer_version
        or row.method_version != METHOD_VERSION
    )
