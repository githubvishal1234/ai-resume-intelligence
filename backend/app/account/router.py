from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from app.account.schemas import (
    AccountDelete,
    PasswordChange,
    ProfileUpdate,
    ProWaitlistOut,
    RevokedOut,
    SignInOut,
)
from app.account.service import AccountService
from app.auth.deps import CurrentAuth
from app.auth.router import check_rate_limit
from app.auth.schemas import UserOut
from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.storage.base import get_storage

router = APIRouter(prefix="/account", tags=["account"])


def get_account_service(
    request: Request,
    auth: CurrentAuth,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AccountService:
    return AccountService(
        db,
        settings,
        get_storage(settings),
        auth.user,
        auth.session,
        request.scope.get("state", {}).get("request_id"),
    )


Service = Annotated[AccountService, Depends(get_account_service)]


@router.patch("", response_model=UserOut)
def update_profile(body: ProfileUpdate, service: Service) -> UserOut:
    return UserOut.model_validate(service.update_profile(body.display_name))


@router.post("/password", response_model=RevokedOut)
def change_password(
    body: PasswordChange,
    service: Service,
    settings: Annotated[Settings, Depends(get_settings)],
) -> RevokedOut:
    check_rate_limit("password", f"user:{service.user.id}", settings)
    return RevokedOut(revoked=service.change_password(body.current_password, body.new_password))


@router.get("/sign-ins", response_model=list[SignInOut])
def sign_ins(service: Service) -> list[SignInOut]:
    return [
        SignInOut(
            id=row.id,
            user_agent=row.user_agent,
            created_at=row.created_at,
            last_seen_at=row.last_seen_at,
            current=current,
        )
        for row, current in service.sign_ins()
    ]


@router.post("/sign-ins/revoke-others", response_model=RevokedOut)
def revoke_others(service: Service) -> RevokedOut:
    return RevokedOut(revoked=service.revoke_others())


@router.delete("/sign-ins/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke(session_id: uuid.UUID, service: Service) -> None:
    service.revoke(session_id)


@router.post("/delete", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    body: AccountDelete,
    response: Response,
    service: Service,
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    check_rate_limit("password", f"user:{service.user.id}", settings)
    service.delete_account(body.password)
    response.delete_cookie(settings.session_cookie_name, path="/")


@router.get("/pro-waitlist", response_model=ProWaitlistOut)
def pro_waitlist(service: Service) -> ProWaitlistOut:
    joined_at = service.pro_waitlist()
    return ProWaitlistOut(joined=joined_at is not None, joined_at=joined_at)


@router.post("/pro-waitlist", response_model=ProWaitlistOut)
def join_pro_waitlist(service: Service) -> ProWaitlistOut:
    return ProWaitlistOut(joined=True, joined_at=service.join_pro_waitlist())
