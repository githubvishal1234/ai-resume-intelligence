"""Application tracker and in-app notifications.

- An application can link to a saved job and to the exact resume version that was sent.
  Both links are checked through the access policy, so another user's job or resume
  looks like "not found".
- Every change is recorded as an append-only event: creation, status moves, edits, notes.
- Follow-up reminders are generated when notifications are read (there is no background
  worker yet). Each reminder has a dedupe key, so reading twice never duplicates one.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.auth.repository import AuditRepository
from app.core.access import Actor, ensure_access
from app.core.errors import AppError, NotFound
from app.models import Application, ApplicationEvent, Job, Notification, Resume
from app.models.application import CLOSED_STATUSES

NOTIFICATION_PAGE = 50


class ApplicationFieldsRequired(AppError):
    status_code = 422
    code = "APPLICATION_FIELDS_REQUIRED"
    message = "Enter the company and the role, or link a saved job."


class ResumeVersionInvalid(AppError):
    status_code = 422
    code = "RESUME_VERSION_INVALID"
    message = "That resume version does not exist."


def _clean(value: str | None) -> str | None:
    value = (value or "").strip()
    return value or None


def is_follow_up_due(application: Application, today: date) -> bool:
    return (
        application.follow_up_on is not None
        and application.follow_up_on <= today
        and application.status not in CLOSED_STATUSES
    )


@dataclass
class ApplicationView:
    application: Application
    job_title: str | None
    resume_title: str | None


class ApplicationService:
    def __init__(self, db: Session, actor: Actor, request_id: str | None = None) -> None:
        self.db = db
        self.actor = actor
        self.audit = AuditRepository(db)
        self.request_id = request_id

    # ---- lookups -----------------------------------------------------------------------
    def _owned(self, application_id: uuid.UUID) -> Application:
        application = self.db.get(Application, application_id)
        if application is None:
            raise NotFound()
        ensure_access(self.actor, application.owner_id)
        return application

    def _job(self, job_id: uuid.UUID) -> Job:
        job = self.db.get(Job, job_id)
        if job is None:
            raise NotFound("The linked job was not found.")
        ensure_access(self.actor, job.owner_id)
        return job

    def _resume_link(
        self, resume_id: uuid.UUID | None, version: int | None
    ) -> tuple[uuid.UUID | None, int | None]:
        if resume_id is None:
            if version is not None:
                raise ResumeVersionInvalid("Pick a resume before picking a version.")
            return None, None
        resume = self.db.get(Resume, resume_id)
        if resume is None:
            raise NotFound("The linked resume was not found.")
        ensure_access(self.actor, resume.owner_id)
        if version is None:
            return resume.id, resume.current_version
        if version > resume.current_version:
            raise ResumeVersionInvalid()
        return resume.id, version

    def view(self, application: Application) -> ApplicationView:
        return self.views([application])[0]

    def views(self, applications: list[Application]) -> list[ApplicationView]:
        job_ids = {a.job_id for a in applications if a.job_id}
        resume_ids = {a.resume_id for a in applications if a.resume_id}
        jobs: dict[uuid.UUID, str] = {}
        resumes: dict[uuid.UUID, str] = {}
        if job_ids:
            jobs = {
                r.id: r.title
                for r in self.db.execute(select(Job.id, Job.title).where(Job.id.in_(job_ids)))
            }
        if resume_ids:
            resumes = {
                r.id: r.title
                for r in self.db.execute(
                    select(Resume.id, Resume.title).where(Resume.id.in_(resume_ids))
                )
            }
        return [
            ApplicationView(
                a,
                jobs.get(a.job_id) if a.job_id else None,
                resumes.get(a.resume_id) if a.resume_id else None,
            )
            for a in applications
        ]

    # ---- commands ----------------------------------------------------------------------
    def list_applications(self, status: str | None = None) -> list[Application]:
        query = select(Application).where(Application.owner_id == self.actor.user_id)
        if status:
            query = query.where(Application.status == status)
        return list(self.db.scalars(query.order_by(Application.updated_at.desc())))

    def get(self, application_id: uuid.UUID) -> Application:
        return self._owned(application_id)

    def create(
        self,
        *,
        job_id: uuid.UUID | None,
        company: str | None,
        role: str | None,
        url: str | None,
        resume_id: uuid.UUID | None,
        resume_version: int | None,
        status: str,
        applied_on: date | None,
        follow_up_on: date | None,
        notes: str,
        today: date | None = None,
    ) -> Application:
        job = self._job(job_id) if job_id else None
        company = _clean(company) or (job.company if job else None)
        role = _clean(role) or (job.title if job else None)
        if not company or not role:
            raise ApplicationFieldsRequired()
        resume_id, resume_version = self._resume_link(resume_id, resume_version)
        if applied_on is None and status != "saved":
            applied_on = today or date.today()
        application = Application(
            owner_id=self.actor.user_id,
            job_id=job.id if job else None,
            company=company,
            role=role,
            url=url,
            resume_id=resume_id,
            resume_version=resume_version,
            status=status,
            applied_on=applied_on,
            follow_up_on=follow_up_on,
            notes=notes.strip(),
        )
        self.db.add(application)
        self.db.flush()
        self.db.add(
            ApplicationEvent(application_id=application.id, kind="created", to_status=status)
        )
        self._audit("application.create", str(application.id))
        self.db.commit()
        return application

    def update(
        self,
        application_id: uuid.UUID,
        changes: dict[str, object],
        today: date | None = None,
    ) -> Application:
        application = self._owned(application_id)
        edited: list[str] = []

        def set_field(name: str, value: object) -> None:
            if getattr(application, name) != value:
                setattr(application, name, value)
                edited.append(name)

        for name in ("company", "role"):
            if name in changes:
                value = _clean(changes[name])  # type: ignore[arg-type]
                if value is None:
                    raise ApplicationFieldsRequired()
                set_field(name, value)
        if "url" in changes:
            set_field("url", str(changes["url"]) if changes["url"] else None)
        if "job_id" in changes:
            job_id = changes["job_id"]
            set_field("job_id", self._job(job_id).id if job_id else None)  # type: ignore[arg-type]
        if "resume_id" in changes or "resume_version" in changes:
            resume_id = changes.get("resume_id", application.resume_id)
            version = changes.get("resume_version")
            if "resume_version" not in changes and resume_id == application.resume_id:
                version = application.resume_version
            linked_id, linked_version = self._resume_link(resume_id, version)  # type: ignore[arg-type]
            set_field("resume_id", linked_id)
            set_field("resume_version", linked_version)
        for name in ("applied_on", "follow_up_on"):
            if name in changes:
                set_field(name, changes[name])
        if "notes" in changes:
            set_field("notes", str(changes["notes"] or "").strip())

        status_event: ApplicationEvent | None = None
        new_status = changes.get("status")
        if new_status and new_status != application.status:
            status_event = ApplicationEvent(
                application_id=application.id,
                kind="status",
                from_status=application.status,
                to_status=new_status,
            )
            application.status = str(new_status)
            if application.applied_on is None and new_status != "saved":
                application.applied_on = today or date.today()
                edited.append("applied_on")

        if edited:
            self.db.add(
                ApplicationEvent(application_id=application.id, kind="edited", fields=edited)
            )
        if status_event:
            self.db.add(status_event)
        if edited or status_event:
            application.updated_at = datetime.now(UTC)
        self.db.commit()
        self.db.refresh(application)
        return application

    def add_note(self, application_id: uuid.UUID, note: str) -> Application:
        application = self._owned(application_id)
        self.db.add(ApplicationEvent(application_id=application.id, kind="note", note=note.strip()))
        application.updated_at = datetime.now(UTC)
        self.db.commit()
        self.db.refresh(application)
        return application

    def delete(self, application_id: uuid.UUID) -> None:
        application = self._owned(application_id)
        self.db.delete(application)
        self._audit("application.delete", str(application_id))
        self.db.commit()

    def _audit(self, action: str, resource_id: str) -> None:
        self.audit.record(
            action=action,
            outcome="success",
            actor_user_id=self.actor.user_id,
            request_id=self.request_id,
            resource_type="application",
            resource_id=resource_id,
        )


class NotificationService:
    def __init__(self, db: Session, actor: Actor) -> None:
        self.db = db
        self.actor = actor

    def refresh(self, today: date | None = None) -> None:
        """Create a reminder for every open application whose follow-up date has arrived."""
        today = today or date.today()
        due = self.db.scalars(
            select(Application).where(
                Application.owner_id == self.actor.user_id,
                Application.follow_up_on.is_not(None),
                Application.follow_up_on <= today,
                Application.status.not_in(CLOSED_STATUSES),
            )
        ).all()
        existing = set(
            self.db.scalars(
                select(Notification.dedupe_key).where(
                    Notification.owner_id == self.actor.user_id,
                    Notification.kind == "follow_up_due",
                )
            )
        )
        rows = [
            {
                "id": uuid.uuid4(),
                "owner_id": self.actor.user_id,
                "application_id": a.id,
                "kind": "follow_up_due",
                "dedupe_key": f"follow_up:{a.id}:{a.follow_up_on}",
                "title": f"Follow up with {a.company}"[:300],
                "body": (
                    f"You planned to follow up on your {a.role} application on "
                    f"{a.follow_up_on:%d %b %Y}."
                ),
                "link": f"/applications/{a.id}",
            }
            for a in due
            if f"follow_up:{a.id}:{a.follow_up_on}" not in existing
        ]
        if rows:  # ON CONFLICT still guards against two requests racing
            self.db.execute(
                insert(Notification)
                .values(rows)
                .on_conflict_do_nothing(constraint="uq_notifications_owner_id_dedupe_key")
            )
            self.db.commit()

    def list_notifications(self) -> list[Notification]:
        return list(
            self.db.scalars(
                select(Notification)
                .where(Notification.owner_id == self.actor.user_id)
                .order_by(Notification.created_at.desc(), Notification.id)
                .limit(NOTIFICATION_PAGE)
            )
        )

    def unread_count(self) -> int:
        return int(
            self.db.scalar(
                select(func.count())
                .select_from(Notification)
                .where(Notification.owner_id == self.actor.user_id, Notification.read_at.is_(None))
            )
            or 0
        )

    def mark_read(self, notification_id: uuid.UUID) -> Notification:
        notification = self.db.get(Notification, notification_id)
        if notification is None:
            raise NotFound()
        ensure_access(self.actor, notification.owner_id)
        if notification.read_at is None:
            notification.read_at = datetime.now(UTC)
            self.db.commit()
        return notification

    def mark_all_read(self) -> None:
        self.db.execute(
            update(Notification)
            .where(Notification.owner_id == self.actor.user_id, Notification.read_at.is_(None))
            .values(read_at=datetime.now(UTC))
        )
        self.db.commit()
