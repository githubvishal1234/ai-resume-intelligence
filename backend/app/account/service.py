"""Account self-service: profile, password, signed-in browsers and account deletion.

Deleting an account removes every row the user owns (foreign keys cascade from `users`) and
then their stored files. No retention policy is applied or invented here (D-08): this is the
user-initiated delete the plan calls for, and it happens at once.
"""

from __future__ import annotations

import logging
import uuid

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.auth.repository import AuditRepository
from app.auth.service import WeakPassword
from app.core.config import Settings
from app.core.errors import AppError, NotFound
from app.core.security import hash_password, verify_password
from app.models import ResumeFile, User, UserSession
from app.storage.base import StorageBackend

logger = logging.getLogger(__name__)


class SamePassword(AppError):
    status_code = 422
    code = "SAME_PASSWORD"
    message = "The new password must be different from the current one."

    def __init__(self) -> None:
        super().__init__(details=[{"field": "new_password", "message": self.message}])


class WrongPassword(AppError):
    # 422, not 401: the browser is still signed in and must not be sent to the login page.
    status_code = 422
    code = "WRONG_PASSWORD"
    message = "That password is not correct."


class AccountService:
    def __init__(
        self,
        db: Session,
        settings: Settings,
        storage: StorageBackend,
        user: User,
        session: UserSession,
        request_id: str | None = None,
    ) -> None:
        self.db = db
        self.settings = settings
        self.storage = storage
        self.user = user
        self.session = session
        self.request_id = request_id
        self.audit = AuditRepository(db)

    def update_profile(self, display_name: str) -> User:
        self.user.display_name = display_name
        self._audit("account.profile_updated", "success")
        self.db.commit()
        return self.user

    def change_password(self, current: str, new: str) -> int:
        """Change the password and sign out every other browser. Returns how many were."""
        self._require_password(current, "account.password_changed", "current_password")
        if len(new) < self.settings.password_min_length:
            raise WeakPassword(
                f"Password must be at least {self.settings.password_min_length} characters.",
                details=[{"field": "new_password", "message": "Password is too short."}],
            )
        if verify_password(self.user.password_hash, new):
            raise SamePassword()
        self.user.password_hash = hash_password(new)
        revoked = self._delete_other_sessions()
        self._audit("account.password_changed", "success", {"signed_out": str(revoked)})
        self.db.commit()
        return revoked

    def sign_ins(self) -> list[tuple[UserSession, bool]]:
        rows = self.db.scalars(
            select(UserSession)
            .where(UserSession.user_id == self.user.id)
            .order_by(UserSession.last_seen_at.desc())
        ).all()
        return [(row, row.id == self.session.id) for row in rows]

    def revoke(self, session_id: uuid.UUID) -> None:
        row = self.db.get(UserSession, session_id)
        if row is None or row.user_id != self.user.id:
            raise NotFound("That sign-in was not found.")
        self.db.delete(row)
        self._audit("account.sign_in_revoked", "success")
        self.db.commit()

    def revoke_others(self) -> int:
        revoked = self._delete_other_sessions()
        self._audit("account.sign_ins_revoked", "success", {"signed_out": str(revoked)})
        self.db.commit()
        return revoked

    def delete_account(self, password: str) -> None:
        self._require_password(password, "account.deleted", "password")
        user_id = self.user.id
        keys = list(
            self.db.scalars(select(ResumeFile.storage_key).where(ResumeFile.owner_id == user_id))
        )
        self.db.execute(delete(User).where(User.id == user_id))
        # Kept without the user: the audit trail records that a deletion happened, not who.
        self.audit.record(
            action="account.deleted",
            outcome="success",
            actor_user_id=None,
            request_id=self.request_id,
            resource_type="user",
            resource_id=str(user_id),
            details={"files": str(len(keys))},
        )
        self.db.commit()
        for key in keys:
            try:
                self.storage.delete(key)
            except Exception:  # the rows are gone; a leftover file is logged, not fatal
                logger.warning("account.delete: stored file not removed", extra={"key": key})

    # ---- helpers -------------------------------------------------------------------------
    def _require_password(self, password: str, action: str, field: str) -> None:
        if not verify_password(self.user.password_hash, password):
            self._audit(action, "failure", {"reason": "wrong_password"})
            self.db.commit()
            raise WrongPassword(details=[{"field": field, "message": WrongPassword.message}])

    def _delete_other_sessions(self) -> int:
        result = self.db.execute(
            delete(UserSession).where(
                UserSession.user_id == self.user.id, UserSession.id != self.session.id
            )
        )
        return int(getattr(result, "rowcount", 0) or 0)

    def _audit(self, action: str, outcome: str, details: dict[str, str] | None = None) -> None:
        self.audit.record(
            action=action,
            outcome=outcome,
            actor_user_id=self.user.id,
            request_id=self.request_id,
            resource_type="user",
            resource_id=str(self.user.id),
            details=details or {},
        )
