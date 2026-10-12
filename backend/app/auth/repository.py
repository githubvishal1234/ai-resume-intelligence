from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.models import AuditLog, User, UserSession


class UserRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_email(self, email: str) -> User | None:
        return self.db.scalar(select(User).where(User.email == email))

    def add(self, user: User) -> User:
        self.db.add(user)
        self.db.flush()
        return user


class SessionRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def add(self, session: UserSession) -> UserSession:
        self.db.add(session)
        self.db.flush()
        return session

    def get_by_token_hash(self, token_hash: str) -> UserSession | None:
        return self.db.scalar(select(UserSession).where(UserSession.token_hash == token_hash))

    def touch(self, session_id: uuid.UUID, when: datetime) -> None:
        self.db.execute(
            update(UserSession).where(UserSession.id == session_id).values(last_seen_at=when)
        )

    def delete(self, session_id: uuid.UUID) -> None:
        self.db.execute(delete(UserSession).where(UserSession.id == session_id))

    def delete_expired(self, now: datetime) -> int:
        result = self.db.execute(delete(UserSession).where(UserSession.expires_at < now))
        return int(getattr(result, "rowcount", 0) or 0)


class AuditRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def record(
        self,
        *,
        action: str,
        outcome: str,
        actor_user_id: uuid.UUID | None,
        request_id: str | None,
        resource_type: str | None = None,
        resource_id: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        self.db.add(
            AuditLog(
                action=action,
                outcome=outcome,
                actor_user_id=actor_user_id,
                request_id=request_id,
                resource_type=resource_type,
                resource_id=resource_id,
                details=details or {},
            )
        )
