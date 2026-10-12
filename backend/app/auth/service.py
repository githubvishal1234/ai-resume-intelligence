"""Authentication business logic. Routes stay thin; all rules live here."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.repository import AuditRepository, SessionRepository, UserRepository
from app.core.config import Settings
from app.core.errors import (
    AppError,
    EmailAlreadyRegistered,
    InvalidCredentials,
    RegistrationDisabled,
)
from app.core.security import (
    hash_password,
    hash_token,
    needs_rehash,
    new_token,
    verify_password,
)
from app.models import User, UserSession

_TOUCH_INTERVAL = timedelta(minutes=1)


class WeakPassword(AppError):
    status_code = 422
    code = "WEAK_PASSWORD"


@dataclass
class IssuedSession:
    user: User
    token: str  # raw cookie value, shown once
    csrf_token: str
    expires_at: datetime


def normalize_email(email: str) -> str:
    return email.strip().lower()


class AuthService:
    def __init__(self, db: Session, settings: Settings, request_id: str | None = None) -> None:
        self.db = db
        self.settings = settings
        self.request_id = request_id
        self.users = UserRepository(db)
        self.sessions = SessionRepository(db)
        self.audit = AuditRepository(db)

    # ---- registration -------------------------------------------------------------------
    def register(
        self, *, email: str, password: str, display_name: str, user_agent: str | None
    ) -> IssuedSession:
        if not self.settings.registration_enabled:
            raise RegistrationDisabled()
        self._check_password_policy(password)
        email = normalize_email(email)

        if self.users.get_by_email(email):
            self._audit("auth.register", "failure", None, {"reason": "email_exists"})
            self.db.commit()
            raise EmailAlreadyRegistered()

        user = User(email=email, password_hash=hash_password(password), display_name=display_name)
        try:
            self.users.add(user)
        except IntegrityError:  # concurrent registration won the race
            self.db.rollback()
            raise EmailAlreadyRegistered() from None

        issued = self._open_session(user, user_agent)
        user.last_login_at = datetime.now(UTC)
        self._audit("auth.register", "success", user.id, {})
        self.db.commit()
        return issued

    # ---- login / logout ----------------------------------------------------------------
    def login(self, *, email: str, password: str, user_agent: str | None) -> IssuedSession:
        email = normalize_email(email)
        user = self.users.get_by_email(email)
        valid = verify_password(user.password_hash if user else None, password)
        if not user or not valid or not user.is_active:
            self._audit(
                "auth.login",
                "failure",
                user.id if user else None,
                {"reason": "invalid_credentials"},
            )
            self.db.commit()
            raise InvalidCredentials()

        if needs_rehash(user.password_hash):
            user.password_hash = hash_password(password)
        user.last_login_at = datetime.now(UTC)
        issued = self._open_session(user, user_agent)
        self._audit("auth.login", "success", user.id, {})
        self.db.commit()
        return issued

    def logout(self, session: UserSession) -> None:
        user_id = session.user_id
        self.sessions.delete(session.id)
        self._audit("auth.logout", "success", user_id, {})
        self.db.commit()

    # ---- session resolution (used by the auth dependency) ------------------------------
    def resolve_session(self, raw_token: str) -> UserSession | None:
        session = self.sessions.get_by_token_hash(hash_token(raw_token))
        if session is None:
            return None
        now = datetime.now(UTC)
        idle_limit = session.last_seen_at + timedelta(hours=self.settings.session_idle_ttl_hours)
        if session.expires_at <= now or idle_limit <= now or not session.user.is_active:
            self.sessions.delete(session.id)
            self.db.commit()
            return None
        if now - session.last_seen_at > _TOUCH_INTERVAL:
            self.sessions.touch(session.id, now)
            self.db.commit()
        return session

    # ---- helpers ---------------------------------------------------------------------
    def _open_session(self, user: User, user_agent: str | None) -> IssuedSession:
        token = new_token()
        csrf = new_token()
        expires = datetime.now(UTC) + timedelta(hours=self.settings.session_absolute_ttl_hours)
        self.sessions.add(
            UserSession(
                user_id=user.id,
                token_hash=hash_token(token),
                csrf_token=csrf,
                user_agent=(user_agent or "")[:255] or None,
                expires_at=expires,
            )
        )
        return IssuedSession(user=user, token=token, csrf_token=csrf, expires_at=expires)

    def _check_password_policy(self, password: str) -> None:
        if len(password) < self.settings.password_min_length:
            raise WeakPassword(
                f"Password must be at least {self.settings.password_min_length} characters.",
                details=[{"field": "password", "message": "Password is too short."}],
            )

    def _audit(
        self, action: str, outcome: str, actor: uuid.UUID | None, details: dict[str, str]
    ) -> None:
        self.audit.record(
            action=action,
            outcome=outcome,
            actor_user_id=actor,
            request_id=self.request_id,
            resource_type="user" if actor else None,
            resource_id=str(actor) if actor else None,
            details=details,
        )
