"""Cover letters: drafted from a resume version and a saved job, then edited and exported."""

from __future__ import annotations

import uuid
from dataclasses import asdict
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.access import Actor, ensure_access
from app.core.errors import AppError, NotFound
from app.coverletters.draft import draft_letter
from app.coverletters.schemas import CreateLetterIn, UpdateLetterIn
from app.jobs.analyzer import JobAnalysis
from app.matching.matcher import match
from app.models import CoverLetter, Job, Resume, ResumeVersion
from app.output.pdf import render_letter
from app.output.templates import TEMPLATES
from app.resumes.content import Contact, ResumeContent


class ResumeRequired(AppError):
    status_code = 409
    code = "MASTER_RESUME_REQUIRED"
    message = "Add your master resume first: the letter is drafted from it."


class UnknownLetterTemplate(AppError):
    status_code = 422
    code = "UNKNOWN_TEMPLATE"
    message = "That template does not exist."


def _check_template(template_id: str) -> str:
    if template_id not in TEMPLATES:
        raise UnknownLetterTemplate()
    return template_id


class CoverLetterService:
    def __init__(self, db: Session, actor: Actor) -> None:
        self.db = db
        self.actor = actor

    def _owned(self, letter_id: uuid.UUID) -> CoverLetter:
        letter = self.db.get(CoverLetter, letter_id)
        if letter is None:
            raise NotFound()
        ensure_access(self.actor, letter.owner_id)
        return letter

    def _resume(self, resume_id: uuid.UUID | None) -> Resume:
        if resume_id is None:
            found = self.db.scalar(
                select(Resume).where(
                    Resume.owner_id == self.actor.user_id,
                    Resume.kind == "master",
                    Resume.status == "active",
                )
            )
            if found is None:
                raise ResumeRequired()
            return found
        resume = self.db.get(Resume, resume_id)
        if resume is None:
            raise NotFound()
        ensure_access(self.actor, resume.owner_id)
        return resume

    def _content(self, resume: Resume) -> ResumeContent:
        content = self.db.scalar(
            select(ResumeVersion.content).where(
                ResumeVersion.resume_id == resume.id,
                ResumeVersion.version == resume.current_version,
            )
        )
        return ResumeContent.model_validate(content or {})

    def list(self) -> list[CoverLetter]:
        return list(
            self.db.scalars(
                select(CoverLetter)
                .where(CoverLetter.owner_id == self.actor.user_id)
                .order_by(CoverLetter.updated_at.desc())
            )
        )

    def get(self, letter_id: uuid.UUID) -> CoverLetter:
        return self._owned(letter_id)

    def create(self, body: CreateLetterIn) -> CoverLetter:
        template = _check_template(body.template)
        resume = self._resume(body.resume_id)
        content = self._content(resume)
        job: Job | None = None
        if body.job_id is not None:
            job = self.db.get(Job, body.job_id)
            if job is None:
                raise NotFound()
            ensure_access(self.actor, job.owner_id)
        result = match(content, JobAnalysis.model_validate(job.analysis)) if job else None
        d = draft_letter(content, job.title if job else None, job.company if job else None, result)
        letter = CoverLetter(
            owner_id=self.actor.user_id,
            resume_id=resume.id,
            job_id=job.id if job else None,
            title=d.title,
            company=d.company,
            body=d.body,
            template=template,
            evidence=[asdict(p) for p in d.points],
        )
        self.db.add(letter)
        self.db.commit()
        return letter

    def update(self, letter_id: uuid.UUID, body: UpdateLetterIn) -> CoverLetter:
        letter = self._owned(letter_id)
        if body.template is not None:
            letter.template = _check_template(body.template)
        for name in ("title", "recipient_name", "company", "body"):
            value = getattr(body, name)
            if value is not None:
                setattr(letter, name, value)
        self.db.commit()
        return letter

    def delete(self, letter_id: uuid.UUID) -> None:
        self.db.delete(self._owned(letter_id))
        self.db.commit()

    def pdf(self, letter_id: uuid.UUID, today: date | None = None) -> tuple[CoverLetter, bytes]:
        letter = self._owned(letter_id)
        contact = Contact()
        if letter.resume_id is not None:
            resume = self.db.get(Resume, letter.resume_id)
            if resume is not None:
                contact = self._content(resume).contact
        data = render_letter(
            contact,
            letter.recipient_name,
            letter.company,
            letter.body,
            TEMPLATES[letter.template],
            today or date.today(),
            title=letter.title,
        )
        return letter, data
