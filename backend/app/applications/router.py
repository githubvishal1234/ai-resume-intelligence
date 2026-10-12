from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.applications.schemas import (
    AddNoteIn,
    ApplicationDetailOut,
    ApplicationEventOut,
    ApplicationStatus,
    ApplicationSummaryOut,
    CreateApplicationIn,
    NotificationOut,
    UnreadCountOut,
    UpdateApplicationIn,
)
from app.applications.service import (
    ApplicationService,
    ApplicationView,
    NotificationService,
    is_follow_up_due,
)
from app.auth.deps import CurrentAuth
from app.db.session import get_db

router = APIRouter(prefix="/applications", tags=["applications"])
notifications_router = APIRouter(prefix="/notifications", tags=["notifications"])

DB = Annotated[Session, Depends(get_db)]


def get_application_service(request: Request, auth: CurrentAuth, db: DB) -> ApplicationService:
    return ApplicationService(db, auth.actor, request.scope.get("state", {}).get("request_id"))


def get_notification_service(auth: CurrentAuth, db: DB) -> NotificationService:
    return NotificationService(db, auth.actor)


Service = Annotated[ApplicationService, Depends(get_application_service)]
Notifications = Annotated[NotificationService, Depends(get_notification_service)]


def _summary(view: ApplicationView, today: date) -> ApplicationSummaryOut:
    out = ApplicationSummaryOut.model_validate(view.application)
    out.job_title = view.job_title
    out.resume_title = view.resume_title
    out.follow_up_due = is_follow_up_due(view.application, today)
    return out


def _detail(view: ApplicationView) -> ApplicationDetailOut:
    a = view.application
    return ApplicationDetailOut(
        **_summary(view, date.today()).model_dump(),
        notes=a.notes,
        events=[ApplicationEventOut.model_validate(e) for e in a.events],
    )


@router.get("", response_model=list[ApplicationSummaryOut])
def list_applications(
    service: Service,
    status_filter: Annotated[ApplicationStatus | None, Query(alias="status")] = None,
) -> list[ApplicationSummaryOut]:
    today = date.today()
    return [_summary(v, today) for v in service.views(service.list_applications(status_filter))]


@router.post("", response_model=ApplicationDetailOut, status_code=status.HTTP_201_CREATED)
def create_application(body: CreateApplicationIn, service: Service) -> ApplicationDetailOut:
    application = service.create(
        job_id=body.job_id,
        company=body.company,
        role=body.role,
        url=str(body.url) if body.url else None,
        resume_id=body.resume_id,
        resume_version=body.resume_version,
        status=body.status,
        applied_on=body.applied_on,
        follow_up_on=body.follow_up_on,
        notes=body.notes,
    )
    return _detail(service.view(application))


@router.get("/{application_id}", response_model=ApplicationDetailOut)
def get_application(application_id: uuid.UUID, service: Service) -> ApplicationDetailOut:
    return _detail(service.view(service.get(application_id)))


@router.patch("/{application_id}", response_model=ApplicationDetailOut)
def update_application(
    application_id: uuid.UUID, body: UpdateApplicationIn, service: Service
) -> ApplicationDetailOut:
    changes = {name: getattr(body, name) for name in body.model_fields_set}
    return _detail(service.view(service.update(application_id, changes)))


@router.post("/{application_id}/notes", response_model=ApplicationDetailOut)
def add_note(application_id: uuid.UUID, body: AddNoteIn, service: Service) -> ApplicationDetailOut:
    return _detail(service.view(service.add_note(application_id, body.note)))


@router.delete("/{application_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_application(application_id: uuid.UUID, service: Service) -> None:
    service.delete(application_id)


@notifications_router.get("", response_model=list[NotificationOut])
def list_notifications(service: Notifications) -> list[NotificationOut]:
    service.refresh()
    return [NotificationOut.model_validate(n) for n in service.list_notifications()]


@notifications_router.get("/unread-count", response_model=UnreadCountOut)
def unread_count(service: Notifications) -> UnreadCountOut:
    service.refresh()
    return UnreadCountOut(unread=service.unread_count())


@notifications_router.post("/{notification_id}/read", response_model=NotificationOut)
def mark_read(notification_id: uuid.UUID, service: Notifications) -> NotificationOut:
    return NotificationOut.model_validate(service.mark_read(notification_id))


@notifications_router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_read(service: Notifications) -> None:
    service.mark_all_read()
