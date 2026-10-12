"""Master resume business rules.

Invariants:
- A user has at most one active master resume (also enforced by a partial unique index).
- Content changes never modify a version; they append a new immutable version
  (also enforced by a database trigger). Edits must name the version they were based on,
  so a stale editor cannot silently overwrite newer work.
- Every lookup goes through the access policy; another user's resume looks like "not found".
"""

from __future__ import annotations

import hashlib
import uuid
from dataclasses import asdict
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.repository import AuditRepository
from app.core.access import Actor, ensure_access
from app.core.config import Settings
from app.core.errors import AppError, Conflict, NotFound
from app.models import Resume, ResumeFile, ResumeImport, ResumeVersion
from app.resumes.content import ResumeContent
from app.resumes.extraction import MEDIA_TYPES, extract_text, safe_display_name
from app.resumes.parser import parse_resume
from app.storage.base import StorageBackend


class VersionConflict(Conflict):
    code = "VERSION_CONFLICT"
    message = "This resume changed since you opened it. Reload to see the latest version."


class MasterExists(Conflict):
    code = "MASTER_RESUME_EXISTS"
    message = "You already have a master resume. Upload a new version of it instead."


class ImportNotPending(Conflict):
    code = "IMPORT_NOT_PENDING"
    message = "This upload was already saved or discarded."


class EmptyResume(AppError):
    status_code = 422
    code = "RESUME_EMPTY"
    message = "The resume has no content. Add at least your name or one section."


class ResumeService:
    def __init__(
        self,
        db: Session,
        settings: Settings,
        storage: StorageBackend,
        actor: Actor,
        request_id: str | None = None,
    ) -> None:
        self.db = db
        self.settings = settings
        self.storage = storage
        self.actor = actor
        self.audit = AuditRepository(db)
        self.request_id = request_id

    # ---- lookups ------------------------------------------------------------------------
    def _owned_resume(self, resume_id: uuid.UUID) -> Resume:
        resume = self.db.get(Resume, resume_id)
        if resume is None:
            raise NotFound()
        ensure_access(self.actor, resume.owner_id)
        return resume

    def _owned_import(self, import_id: uuid.UUID) -> ResumeImport:
        item = self.db.get(ResumeImport, import_id)
        if item is None:
            raise NotFound()
        ensure_access(self.actor, item.owner_id)
        return item

    def active_master(self) -> Resume | None:
        return self.db.scalar(
            select(Resume).where(
                Resume.owner_id == self.actor.user_id,
                Resume.kind == "master",
                Resume.status == "active",
            )
        )

    def list_resumes(self) -> list[Resume]:
        return list(
            self.db.scalars(
                select(Resume)
                .where(Resume.owner_id == self.actor.user_id)
                .order_by(Resume.kind, Resume.updated_at.desc())
            )
        )

    def get(self, resume_id: uuid.UUID) -> tuple[Resume, ResumeVersion]:
        resume = self._owned_resume(resume_id)
        return resume, self._version(resume, resume.current_version)

    def _version(self, resume: Resume, version: int) -> ResumeVersion:
        row = self.db.scalar(
            select(ResumeVersion).where(
                ResumeVersion.resume_id == resume.id, ResumeVersion.version == version
            )
        )
        if row is None:
            raise NotFound()
        return row

    def versions(self, resume_id: uuid.UUID) -> list[ResumeVersion]:
        resume = self._owned_resume(resume_id)
        return list(
            self.db.scalars(
                select(ResumeVersion)
                .where(ResumeVersion.resume_id == resume.id)
                .order_by(ResumeVersion.version.desc())
            )
        )

    def version(self, resume_id: uuid.UUID, version: int) -> ResumeVersion:
        return self._version(self._owned_resume(resume_id), version)

    def version_file(self, resume_id: uuid.UUID, version: int) -> tuple[ResumeFile, bytes]:
        row = self.version(resume_id, version)
        file = self.db.get(ResumeFile, row.file_id) if row.file_id else None
        if file is None:
            raise NotFound()
        return file, self.storage.get(file.storage_key)

    # ---- import (upload -> parse -> review) --------------------------------------------
    def create_import(self, filename: str, data: bytes) -> ResumeImport:
        extracted = extract_text(filename, data, self.settings.max_upload_bytes)
        parsed = parse_resume(extracted.text)
        file_id = uuid.uuid4()
        key = f"users/{self.actor.user_id}/resume-files/{file_id.hex}.{extracted.kind}"
        self.storage.put(key, data)
        try:
            file = ResumeFile(
                id=file_id,
                owner_id=self.actor.user_id,
                storage_key=key,
                sha256=hashlib.sha256(data).hexdigest(),
                media_type=MEDIA_TYPES[extracted.kind],
                size_bytes=len(data),
                original_filename=safe_display_name(filename),
            )
            self.db.add(file)
            report: dict[str, Any] = {
                "parser_version": parsed.parser_version,
                "file_kind": extracted.kind,
                "pages": extracted.pages,
                "characters": len(extracted.text),
                "truncated": extracted.truncated,
                "headings_found": parsed.headings_found,
                "sections": [asdict(s) for s in parsed.sections],
                "warnings": parsed.warnings
                + (["The document was very long; only the first part was read."]
                   if extracted.truncated else []),
            }
            item = ResumeImport(
                owner_id=self.actor.user_id,
                file_id=file.id,
                status="pending_review",
                parsed=parsed.content.model_dump(mode="json"),
                report=report,
            )
            self.db.add(item)
            self.db.flush()
            self._audit("resume.import", "resume_import", str(item.id))
            self.db.commit()
        except Exception:
            self.db.rollback()
            self.storage.delete(key)
            raise
        return item

    def get_import(self, import_id: uuid.UUID) -> ResumeImport:
        return self._owned_import(import_id)

    def discard_import(self, import_id: uuid.UUID) -> None:
        item = self._owned_import(import_id)
        if item.status != "pending_review":
            raise ImportNotPending()
        item.status = "discarded"
        file = item.file
        still_used = self.db.scalar(
            select(func.count()).select_from(ResumeVersion).where(ResumeVersion.file_id == file.id)
        )
        if not still_used:
            self.storage.delete(file.storage_key)
            self.db.delete(file)  # cascades to the import row
        self.db.commit()

    def confirm_import(
        self, import_id: uuid.UUID, content: ResumeContent, title: str | None
    ) -> tuple[Resume, ResumeVersion, bool]:
        """Returns (resume, version, created_new_resume)."""
        item = self._owned_import(import_id)
        if item.status != "pending_review":
            raise ImportNotPending()
        self._require_content(content)
        master = self.active_master()
        created = master is None
        if master is None:
            master = self._new_master(title or "Master resume")
        version = self._append_version(master, content, "upload", file_id=item.file_id)
        item.status = "confirmed"
        self._commit_or_conflict()
        return master, version, created

    # ---- create / edit ------------------------------------------------------------------
    def create_master(self, title: str, content: ResumeContent) -> tuple[Resume, ResumeVersion]:
        if self.active_master() is not None:
            raise MasterExists()
        self._require_content(content)
        master = self._new_master(title)
        version = self._append_version(master, content, "edit", note="Created from scratch")
        self._commit_or_conflict()
        return master, version

    def update_content(
        self, resume_id: uuid.UUID, base_version: int, content: ResumeContent, note: str | None
    ) -> tuple[Resume, ResumeVersion]:
        resume = self._owned_resume(resume_id)
        self._check_base(resume, base_version)
        self._require_content(content)
        current = self._version(resume, resume.current_version)
        if ResumeContent.model_validate(current.content) == content:
            return resume, current  # nothing changed: no new version
        version = self._append_version(resume, content, "edit", note=note)
        self._commit_or_conflict()
        return resume, version

    def restore(self, resume_id: uuid.UUID, version: int, base_version: int
                ) -> tuple[Resume, ResumeVersion]:
        resume = self._owned_resume(resume_id)
        self._check_base(resume, base_version)
        source = self._version(resume, version)
        new = self._append_version(
            resume,
            ResumeContent.model_validate(source.content),
            "restore",
            note=f"Restored from version {version}",
            file_id=source.file_id,
        )
        self._commit_or_conflict()
        return resume, new

    def rename(self, resume_id: uuid.UUID, title: str) -> Resume:
        resume = self._owned_resume(resume_id)
        resume.title = title.strip() or resume.title
        self.db.commit()
        return resume

    def delete(self, resume_id: uuid.UUID) -> None:
        """User-initiated hard delete of the resume, its versions and its uploaded files."""
        resume = self._owned_resume(resume_id)
        ids = [resume.id] + list(
            self.db.scalars(select(Resume.id).where(Resume.master_resume_id == resume.id))
        )
        file_ids = set(
            self.db.scalars(
                select(ResumeVersion.file_id).where(
                    ResumeVersion.resume_id.in_(ids), ResumeVersion.file_id.is_not(None)
                )
            )
        )
        files = list(self.db.scalars(select(ResumeFile).where(ResumeFile.id.in_(file_ids))))
        self.db.delete(resume)
        for file in files:
            self.db.delete(file)
        self._audit("resume.delete", "resume", str(resume_id))
        self.db.commit()
        for file in files:  # after commit: a failed commit must not lose files
            self.storage.delete(file.storage_key)

    # ---- helpers ------------------------------------------------------------------------
    def _new_master(self, title: str) -> Resume:
        resume = Resume(
            owner_id=self.actor.user_id,
            kind="master",
            status="active",
            title=title.strip()[:200] or "Master resume",
            current_version=0,
        )
        self.db.add(resume)
        self.db.flush()
        self._audit("resume.create", "resume", str(resume.id))
        return resume

    def _append_version(
        self,
        resume: Resume,
        content: ResumeContent,
        source: str,
        *,
        note: str | None = None,
        file_id: uuid.UUID | None = None,
    ) -> ResumeVersion:
        number = resume.current_version + 1
        version = ResumeVersion(
            resume_id=resume.id,
            version=number,
            content=content.model_dump(mode="json"),
            source=source,
            note=note,
            file_id=file_id,
            created_by=self.actor.user_id,
        )
        self.db.add(version)
        resume.current_version = number
        resume.updated_at = datetime.now(UTC)
        self.db.flush()
        return version

    def _check_base(self, resume: Resume, base_version: int) -> None:
        if base_version != resume.current_version:
            raise VersionConflict()

    @staticmethod
    def _require_content(content: ResumeContent) -> None:
        if content.is_empty():
            raise EmptyResume()

    def _commit_or_conflict(self) -> None:
        try:
            self.db.commit()
        except IntegrityError:
            # Concurrent save of the same version number, or a second active master.
            self.db.rollback()
            raise VersionConflict() from None

    def _audit(self, action: str, resource_type: str, resource_id: str) -> None:
        self.audit.record(
            action=action,
            outcome="success",
            actor_user_id=self.actor.user_id,
            request_id=self.request_id,
            resource_type=resource_type,
            resource_id=resource_id,
        )
