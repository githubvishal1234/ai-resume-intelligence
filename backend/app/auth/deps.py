"""Authentication dependencies.

`get_auth` is the single entry point for authenticated routes. It enforces the CSRF check for
every non-safe HTTP method, so a route cannot forget it.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.auth.service import AuthService
from app.core.access import Actor
from app.core.config import Settings, get_settings
from app.core.errors import AuthRequired, CsrfInvalid
from app.core.security import constant_time_equals
from app.db.session import get_db
from app.models import User, UserSession

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
CSRF_HEADER = "x-csrf-token"


@dataclass
class AuthContext:
    user: User
    session: UserSession

    @property
    def actor(self) -> Actor:
        return Actor(user_id=self.user.id)


def get_auth_service(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AuthService:
    return AuthService(db, settings, request.scope.get("state", {}).get("request_id"))


def get_auth(
    request: Request,
    service: Annotated[AuthService, Depends(get_auth_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AuthContext:
    raw = request.cookies.get(settings.session_cookie_name)
    if not raw:
        raise AuthRequired()
    session = service.resolve_session(raw)
    if session is None:
        raise AuthRequired()
    if request.method not in SAFE_METHODS:
        supplied = request.headers.get(CSRF_HEADER, "")
        if not supplied or not constant_time_equals(supplied, session.csrf_token):
            raise CsrfInvalid()
    return AuthContext(user=session.user, session=session)


CurrentAuth = Annotated[AuthContext, Depends(get_auth)]
