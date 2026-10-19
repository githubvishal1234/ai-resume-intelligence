from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.auth.deps import CurrentAuth
from app.coverletters.schemas import (
    CreateLetterIn,
    LetterOut,
    LetterPointOut,
    LetterSummaryOut,
    UpdateLetterIn,
)
from app.coverletters.service import CoverLetterService
from app.db.session import get_db
from app.models import CoverLetter
from app.output.router import _filename

router = APIRouter(prefix="/cover-letters", tags=["cover-letters"])


def get_letter_service(
    auth: CurrentAuth, db: Annotated[Session, Depends(get_db)]
) -> CoverLetterService:
    return CoverLetterService(db, auth.actor)


Service = Annotated[CoverLetterService, Depends(get_letter_service)]


def _out(letter: CoverLetter) -> LetterOut:
    return LetterOut(
        **LetterSummaryOut.model_validate(letter).model_dump(),
        recipient_name=letter.recipient_name,
        body=letter.body,
        evidence=[LetterPointOut(**p) for p in letter.evidence],
        created_at=letter.created_at,
    )


@router.get("", response_model=list[LetterSummaryOut])
def list_letters(service: Service) -> list[LetterSummaryOut]:
    return [LetterSummaryOut.model_validate(x) for x in service.list()]


@router.post("", response_model=LetterOut, status_code=status.HTTP_201_CREATED)
def create_letter(body: CreateLetterIn, service: Service) -> LetterOut:
    return _out(service.create(body))


@router.get("/{letter_id}", response_model=LetterOut)
def get_letter(letter_id: uuid.UUID, service: Service) -> LetterOut:
    return _out(service.get(letter_id))


@router.patch("/{letter_id}", response_model=LetterOut)
def update_letter(letter_id: uuid.UUID, body: UpdateLetterIn, service: Service) -> LetterOut:
    return _out(service.update(letter_id, body))


@router.delete("/{letter_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_letter(letter_id: uuid.UUID, service: Service) -> None:
    service.delete(letter_id)


@router.get("/{letter_id}/export.pdf", response_class=Response)
def export_letter(letter_id: uuid.UUID, service: Service) -> Response:
    letter, pdf = service.pdf(letter_id)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"content-disposition": f'attachment; filename="{_filename(letter.title)}"'},
    )
