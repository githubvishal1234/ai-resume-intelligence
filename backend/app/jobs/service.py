"""Saved job descriptions and their deterministic analysis.

- Text comes from a paste, an uploaded file or a link. Links are read only by an approved source
  adapter (`sources.py`, D-05); sites that forbid it, or pages that can't be read, get a clear
  refusal that points to pasting the text.
- Every lookup goes through the access policy; another user's job looks like "not found".
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.registry import get_llm_provider
from app.ai.usage import metered
from app.auth.repository import AuditRepository
from app.core.access import Actor, ensure_access
from app.core.config import Settings
from app.core.errors import AppError, NotFound
from app.jobs.ai_analyzer import AiAnalysisEmpty, ai_analyze
from app.jobs.analyzer import ANALYZER_VERSION, analyze_job, guess_title
from app.jobs.fetch import tidy
from app.jobs.schemas import MAX_JOB_CHARS, MIN_JOB_CHARS
from app.jobs.sources import blocked_site, registered_adapters
from app.models import Job
from app.resumes.extraction import extract_text, safe_display_name


class JobSourceNotSupported(AppError):
    status_code = 422
    code = "JOB_SOURCE_NOT_SUPPORTED"
    message = "Unable to extract this job posting. Paste the job description instead."


class AiJobAnalysisEmpty(AppError):
    status_code = 422
    code = "AI_ANALYSIS_EMPTY"
    message = (
        "The AI did not return any requirement that matches the posting's text. "
        "The current analysis is unchanged."
    )


class JobTextInvalid(AppError):
    status_code = 422
    code = "JOB_TEXT_INVALID"
    message = "The job description is too short. Paste the full posting."


def _clean_meta(value: str | None) -> str | None:
    value = (value or "").strip()
    return value or None


class JobService:
    def __init__(
        self, db: Session, settings: Settings, actor: Actor, request_id: str | None = None
    ) -> None:
        self.db = db
        self.settings = settings
        self.actor = actor
        self.audit = AuditRepository(db)
        self.request_id = request_id

    def _owned(self, job_id: uuid.UUID) -> Job:
        job = self.db.get(Job, job_id)
        if job is None:
            raise NotFound()
        ensure_access(self.actor, job.owner_id)
        return job

    def list_jobs(self) -> list[Job]:
        return list(
            self.db.scalars(
                select(Job)
                .where(Job.owner_id == self.actor.user_id)
                .order_by(Job.created_at.desc())
            )
        )

    def get(self, job_id: uuid.UUID) -> Job:
        return self._owned(job_id)

    def create(
        self,
        text: str,
        *,
        source: str,
        title: str | None = None,
        company: str | None = None,
        location: str | None = None,
        source_url: str | None = None,
        source_filename: str | None = None,
    ) -> Job:
        text = text.replace("\r\n", "\n").strip()
        if len(text) < MIN_JOB_CHARS:
            raise JobTextInvalid()
        text = text[:MAX_JOB_CHARS]
        final_title = (_clean_meta(title) or guess_title(text))[:200]
        company = _clean_meta(company)
        analysis = analyze_job(text, final_title, company or "")
        job = Job(
            owner_id=self.actor.user_id,
            source=source,
            source_url=source_url,
            source_filename=source_filename,
            title=final_title,
            company=company,
            location=_clean_meta(location),
            raw_text=text,
            analysis=analysis.model_dump(mode="json"),
            analyzer_version=ANALYZER_VERSION,
        )
        self.db.add(job)
        self.db.flush()
        self._audit("job.create", str(job.id))
        self.db.commit()
        return job

    def create_from_upload(self, filename: str, data: bytes) -> Job:
        extracted = extract_text(filename, data, self.settings.max_upload_bytes)
        return self.create(
            extracted.text, source="upload", source_filename=safe_display_name(filename)
        )

    def create_from_url(self, url: str) -> Job:
        if site := blocked_site(url):
            raise JobSourceNotSupported(
                f"{site} doesn't allow other apps to read its postings. Open the job there, copy "
                "the description and paste it instead."
            )
        adapter = next((a for a in registered_adapters() if a.matches(url)), None)
        if adapter is None:
            raise JobSourceNotSupported()
        raw = adapter.fetch(url)
        text = tidy(raw.text)
        if len(text) < MIN_JOB_CHARS:
            raise JobSourceNotSupported(
                "That posting has too little text to analyse. Paste the job description instead."
            )
        return self.create(
            text,
            source="url",
            source_url=raw.source_url or url,
            title=raw.title,
            company=raw.company,
            location=raw.location,
        )

    def update(
        self,
        job_id: uuid.UUID,
        *,
        fields: set[str],
        title: str | None,
        company: str | None,
        location: str | None,
    ) -> Job:
        job = self._owned(job_id)
        if "title" in fields:
            job.title = _clean_meta(title) or job.title
        if "company" in fields:
            job.company = _clean_meta(company)
        if "location" in fields:
            job.location = _clean_meta(location)
        job.updated_at = datetime.now(UTC)
        self.db.commit()
        return job

    def reanalyze(self, job_id: uuid.UUID) -> Job:
        job = self._owned(job_id)
        job.analysis = analyze_job(job.raw_text, job.title, job.company or "").model_dump(
            mode="json"
        )
        job.analyzer_version = ANALYZER_VERSION
        job.updated_at = datetime.now(UTC)
        self.db.commit()
        return job

    def ai_analyze(self, job_id: uuid.UUID) -> Job:
        """Replaces the analysis with the AI's; `reanalyze` goes back to the rules."""
        job = self._owned(job_id)
        provider = metered(  # raises when no provider is configured
            get_llm_provider(self.settings), self.actor.user_id, "jobs.ai_analyze", self.settings
        )
        try:
            analysis, _ = ai_analyze(job.raw_text, job.title, job.company or "", provider)
        except AiAnalysisEmpty:
            raise AiJobAnalysisEmpty() from None
        job.analysis = analysis.model_dump(mode="json")
        job.analyzer_version = analysis.analyzer_version
        job.updated_at = datetime.now(UTC)
        self._audit("job.ai_analyze", str(job.id))
        self.db.commit()
        return job

    def delete(self, job_id: uuid.UUID) -> None:
        job = self._owned(job_id)
        self.db.delete(job)
        self._audit("job.delete", str(job_id))
        self.db.commit()

    def _audit(self, action: str, resource_id: str) -> None:
        self.audit.record(
            action=action,
            outcome="success",
            actor_user_id=self.actor.user_id,
            request_id=self.request_id,
            resource_type="job",
            resource_id=resource_id,
        )
