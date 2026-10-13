"""Password reset by emailed link.

Only shown when email is configured. The response to a request is the same whether or not
the address has an account, so it cannot be used to find accounts. Links are single-use,
expire after PASSWORD_RESET_TTL_MINUTES, and only the token's SHA-256 is stored. A new
request replaces any unused link, and a successful reset signs out every browser.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta
from urllib.parse import quote

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.auth.repository import AuditRepository, UserRepository
from app.auth.service import WeakPassword, normalize_email
from app.core.config import Settings
from app.core.errors import AppError
from app.core.security import hash_password, hash_token, new_token
from app.mail.base import EmailNotConfigured, EmailSendFailed, email_status, get_email_sender
from app.models import PasswordResetToken, User, UserSession

logger = logging.getLogger(__name__)


class ResetLinkInvalid(AppError):
    status_code = 400
    code = "RESET_LINK_INVALID"
    message = "This reset link has expired or was already used. Ask for a new one."


class PasswordResetService:
    def __init__(self, db: Session, settings: Settings, request_id: str | None = None) -> None:
        self.db = db
        self.settings = settings
        self.request_id = request_id
        self.users = UserRepository(db)
        self.audit = AuditRepository(db)

    def available(self) -> bool:
        return email_status(self.settings).configured

    def request(self, email: str) -> None:
        if not self.available():
            raise EmailNotConfigured()
        user = self.users.get_by_email(normalize_email(email))
        if user is None or not user.is_active:
            self._audit("auth.password_reset_requested", "failure", None, "unknown_account")
            self.db.commit()
            return
        token = new_token()
        now = datetime.now(UTC)
        ttl = self.settings.password_reset_ttl_minutes
        self.db.execute(
            delete(PasswordResetToken).where(
                PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None)
            )
        )
        self.db.add(
            PasswordResetToken(
                user_id=user.id,
                token_hash=hash_token(token),
                expires_at=now + timedelta(minutes=ttl),
            )
        )
        self.db.flush()
        base = (self.settings.app_base_url or "").rstrip("/")
        try:
            get_email_sender(self.settings).send(
                user.email,
                "password_reset",
                {
                    "display_name": user.display_name,
                    "link": f"{base}/reset-password?token={quote(token)}",
                    "ttl_minutes": ttl,
                },
            )
        except EmailSendFailed:
            # Same answer as for an unknown address; the failure is in the logs and audit.
            self.db.rollback()
            self._audit("auth.password_reset_requested", "failure", user.id, "send_failed")
            self.db.commit()
            return
        self._audit("auth.password_reset_requested", "success", user.id)
        self.db.commit()

    def confirm(self, token: str, new_password: str) -> None:
        now = datetime.now(UTC)
        row = self.db.scalar(
            select(PasswordResetToken)
            .where(PasswordResetToken.token_hash == hash_token(token))
            .with_for_update()
        )
        if row is None or row.used_at is not None or row.expires_at <= now:
            self._audit("auth.password_reset", "failure", row.user_id if row else None, "invalid")
            self.db.commit()
            raise ResetLinkInvalid()
        if len(new_password) < self.settings.password_min_length:
            raise WeakPassword(
                f"Password must be at least {self.settings.password_min_length} characters.",
                details=[{"field": "new_password", "message": "Password is too short."}],
            )
        self.db.execute(
            update(User)
            .where(User.id == row.user_id)
            .values(password_hash=hash_password(new_password))
        )
        row.used_at = now
        self.db.execute(delete(UserSession).where(UserSession.user_id == row.user_id))
        self._audit("auth.password_reset", "success", row.user_id)
        self.db.commit()

    def _audit(
        self, action: str, outcome: str, actor: uuid.UUID | None, reason: str | None = None
    ) -> None:
        self.audit.record(
            action=action,
            outcome=outcome,
            actor_user_id=actor,
            request_id=self.request_id,
            resource_type="user" if actor else None,
            resource_id=str(actor) if actor else None,
            details={"reason": reason} if reason else {},
        )
