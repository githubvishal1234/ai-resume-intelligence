from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.auth.deps import CurrentAuth
from app.db.session import get_db
from app.proofs.schemas import (
    CreateProofIn,
    ProofOut,
    SkillName,
    SuggestionOut,
    SuggestionsOut,
    UpdateProofIn,
)
from app.proofs.service import ProofService
from app.proofs.suggestions import PROOF_VERSION, suggest

router = APIRouter(prefix="/proofs", tags=["proofs"])


def get_proof_service(auth: CurrentAuth, db: Annotated[Session, Depends(get_db)]) -> ProofService:
    return ProofService(db, auth.actor)


Service = Annotated[ProofService, Depends(get_proof_service)]


@router.get("/suggestions", response_model=SuggestionsOut)
def suggestions(_: CurrentAuth, skill: Annotated[SkillName, Query()]) -> SuggestionsOut:
    return SuggestionsOut(
        method_version=PROOF_VERSION,
        skill=skill,
        suggestions=[
            SuggestionOut(kind=s.kind, title=s.title, plan=s.plan) for s in suggest(skill)
        ],
    )


@router.get("", response_model=list[ProofOut])
def list_proofs(service: Service) -> list[ProofOut]:
    return service.list()


@router.post("", response_model=ProofOut, status_code=status.HTTP_201_CREATED)
def create_proof(body: CreateProofIn, service: Service) -> ProofOut:
    return service.create(body)


@router.patch("/{proof_id}", response_model=ProofOut)
def update_proof(proof_id: uuid.UUID, body: UpdateProofIn, service: Service) -> ProofOut:
    return service.update(proof_id, body)


@router.delete("/{proof_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_proof(proof_id: uuid.UUID, service: Service) -> None:
    service.delete(proof_id)
