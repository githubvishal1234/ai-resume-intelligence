from __future__ import annotations

import hashlib
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from app.auth.deps import CurrentAuth, get_auth_service
from app.auth.password_reset import PasswordResetService
from app.auth.schemas import (
    AuthOptionsOut,
    LoginRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    RegisterRequest,
    SessionOut,
    UserOut,
)
from app.auth.service import AuthService, IssuedSession
from app.core.config import Settings, get_settings
from app.core.ratelimit import RateLimiter
from app.db.session import get_db

router = APIRouter(prefix="/auth", tags=["auth"])

_limiters: dict[str, RateLimiter] = {}


def _limiter(kind: str, settings: Settings) -> RateLimiter:
    key = f"{kind}:{settings.auth_rate_limit_attempts}:{settings.auth_rate_limit_window_seconds}"
    if key not in _limiters:
        _limiters[key] = RateLimiter(
            settings.auth_rate_limit_attempts, settings.auth_rate_limit_window_seconds
        )
    return _limiters[key]


def check_rate_limit(kind: str, key: str, settings: Settings) -> None:
    """Shared auth rate limit, also used by account routes that check a password."""
    _limiter(kind, settings).check(key)


def reset_rate_limiters() -> None:
    for limiter in _limiters.values():
        limiter.reset()


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _set_cookie(response: Response, issued: IssuedSession, settings: Settings) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=issued.token,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/",
        expires=issued.expires_at,
    )


def _session_out(issued: IssuedSession) -> SessionOut:
    return SessionOut(user=UserOut.model_validate(issued.user), csrf_token=issued.csrf_token)


@router.post("/register", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def register(
    body: RegisterRequest,
    request: Request,
    response: Response,
    service: Annotated[AuthService, Depends(get_auth_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> SessionOut:
    _limiter("register", settings).check(_client_ip(request))
    issued = service.register(
        email=body.email,
        password=body.password,
        display_name=body.display_name,
        user_agent=request.headers.get("user-agent"),
    )
    _set_cookie(response, issued, settings)
    return _session_out(issued)


@router.post("/login", response_model=SessionOut)
def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    service: Annotated[AuthService, Depends(get_auth_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> SessionOut:
    email_digest = hashlib.sha256(body.email.strip().lower().encode()).hexdigest()[:16]
    limiter = _limiter("login", settings)
    limiter.check(f"ip:{_client_ip(request)}")
    limiter.check(f"acct:{email_digest}")
    issued = service.login(
        email=body.email, password=body.password, user_agent=request.headers.get("user-agent")
    )
    _set_cookie(response, issued, settings)
    return _session_out(issued)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    ctx: CurrentAuth,
    response: Response,
    service: Annotated[AuthService, Depends(get_auth_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    service.logout(ctx.session)
    response.delete_cookie(settings.session_cookie_name, path="/")


@router.get("/me", response_model=SessionOut)
def me(ctx: CurrentAuth) -> SessionOut:
    return SessionOut(user=UserOut.model_validate(ctx.user), csrf_token=ctx.session.csrf_token)


def get_reset_service(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> PasswordResetService:
    return PasswordResetService(db, settings, request.scope.get("state", {}).get("request_id"))


ResetService = Annotated[PasswordResetService, Depends(get_reset_service)]


@router.get("/options", response_model=AuthOptionsOut)
def options(
    service: ResetService, settings: Annotated[Settings, Depends(get_settings)]
) -> AuthOptionsOut:
    return AuthOptionsOut(
        registration=settings.registration_enabled, password_reset=service.available()
    )


@router.post("/password-reset/request", status_code=status.HTTP_202_ACCEPTED)
def request_password_reset(
    body: PasswordResetRequest,
    request: Request,
    service: ResetService,
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, str]:
    """Always the same answer, whether or not the address has an account."""
    email_digest = hashlib.sha256(body.email.strip().lower().encode()).hexdigest()[:16]
    limiter = _limiter("reset", settings)
    limiter.check(f"ip:{_client_ip(request)}")
    limiter.check(f"acct:{email_digest}")
    service.request(body.email)
    return {}


@router.post("/password-reset/confirm", status_code=status.HTTP_204_NO_CONTENT)
def confirm_password_reset(
    body: PasswordResetConfirm,
    request: Request,
    service: ResetService,
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    _limiter("reset-confirm", settings).check(f"ip:{_client_ip(request)}")
    service.confirm(body.token, body.new_password)
