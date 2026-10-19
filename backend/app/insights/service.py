"""Loads the signed-in user's applications, jobs and master resume for the insight functions."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.access import Actor
from app.insights.analysis import (
    MarketMap,
    Outcomes,
    SentApplication,
    attribute_outcomes,
    first_response,
    market_map,
)
from app.jobs.analyzer import JobAnalysis
from app.models import Application, ApplicationEvent, Job, JobMatch, Resume, ResumeVersion
from app.resumes.content import ResumeContent


class InsightsService:
    def __init__(self, db: Session, actor: Actor) -> None:
        self.db = db
        self.actor = actor

    def outcomes(self) -> Outcomes:
        owner = self.actor.user_id
        apps = self.db.scalars(select(Application).where(Application.owner_id == owner)).all()
        events: dict[uuid.UUID, list[ApplicationEvent]] = {}
        for e in self.db.scalars(
            select(ApplicationEvent)
            .join(Application, Application.id == ApplicationEvent.application_id)
            .where(Application.owner_id == owner)
        ):
            events.setdefault(e.application_id, []).append(e)
        titles = dict(
            self.db.execute(select(Resume.id, Resume.title).where(Resume.owner_id == owner)).all()
        )
        # Latest match score per job (rows come newest first, so the first one wins).
        scores: dict[uuid.UUID, int] = {}
        for job_id, overall in self.db.execute(
            select(JobMatch.job_id, JobMatch.overall)
            .where(JobMatch.owner_id == owner)
            .order_by(JobMatch.created_at.desc())
        ):
            scores.setdefault(job_id, overall)

        rows = []
        for a in apps:
            history = events.get(a.id, [])
            label = None
            if a.resume_id and a.resume_id in titles:
                label = titles[a.resume_id] + (
                    f" · v{a.resume_version}" if a.resume_version else ""
                )
            rows.append(
                SentApplication(
                    status=a.status,
                    statuses_seen=[e.to_status for e in history if e.to_status],
                    resume_label=label,
                    match_score=scores.get(a.job_id) if a.job_id else None,
                    sent_on=a.applied_on or a.created_at.date(),
                    first_response_on=first_response((e.to_status, e.created_at) for e in history),
                )
            )
        return attribute_outcomes(rows)

    def market(self) -> tuple[MarketMap, bool]:
        owner = self.actor.user_id
        jobs = [
            (title, JobAnalysis.model_validate(analysis))
            for title, analysis in self.db.execute(
                select(Job.title, Job.analysis).where(Job.owner_id == owner)
            )
        ]
        content = self.db.scalar(
            select(ResumeVersion.content)
            .join(Resume, Resume.id == ResumeVersion.resume_id)
            .where(
                Resume.owner_id == owner,
                Resume.kind == "master",
                Resume.status == "active",
                ResumeVersion.version == Resume.current_version,
            )
        )
        master = ResumeContent.model_validate(content) if content is not None else None
        return market_map(jobs, master), master is not None
