"""Global search over the signed-in user's own records. Plain substring match, no ranking model.

Resumes match on their title or anywhere in their current version's content, so "Kubernetes"
finds every resume that mentions it. Every query is scoped to the owner; at most PER_KIND hits
come back per kind, newest first.
"""

from __future__ import annotations

import uuid
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, StringConstraints
from sqlalchemy import ColumnElement, String, cast, or_, select
from sqlalchemy.orm import Session

from app.auth.deps import CurrentAuth
from app.db.session import get_db
from app.models import Application, CoverLetter, Job, ProofTask, Resume, ResumeVersion

router = APIRouter(prefix="/search", tags=["search"])

PER_KIND = 5
Kind = Literal["resume", "job", "application", "cover_letter", "proof"]
Q = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=100)]


class SearchHit(BaseModel):
    kind: Kind
    id: uuid.UUID
    title: str
    subtitle: str


class SearchOut(BaseModel):
    query: str
    hits: list[SearchHit]


def _like(q: str) -> str:
    """A LIKE pattern for a literal substring: %, _ and the escape character match themselves."""
    return "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


@router.get("", response_model=SearchOut)
def search(
    auth: CurrentAuth, db: Annotated[Session, Depends(get_db)], q: Annotated[Q, Query()]
) -> SearchOut:
    owner = auth.actor.user_id
    pattern = _like(q)

    def has(*columns: Any) -> ColumnElement[bool]:  # model attributes or SQL expressions
        return or_(*(c.ilike(pattern, escape="\\") for c in columns))

    hits: list[SearchHit] = []
    resumes = db.execute(
        select(Resume.id, Resume.title, Resume.kind, Resume.current_version)
        .join(
            ResumeVersion,
            (ResumeVersion.resume_id == Resume.id)
            & (ResumeVersion.version == Resume.current_version),
        )
        .where(Resume.owner_id == owner, Resume.status == "active")
        .where(has(Resume.title, cast(ResumeVersion.content, String)))
        .order_by(Resume.updated_at.desc())
        .limit(PER_KIND)
    )
    for rid, title, kind, version in resumes:
        label = "Master resume" if kind == "master" else "Tailored resume"
        hits.append(SearchHit(kind="resume", id=rid, title=title, subtitle=f"{label} · v{version}"))

    jobs = db.execute(
        select(Job.id, Job.title, Job.company)
        .where(Job.owner_id == owner, has(Job.title, Job.company))
        .order_by(Job.updated_at.desc())
        .limit(PER_KIND)
    )
    for jid, title, company in jobs:
        hits.append(SearchHit(kind="job", id=jid, title=title, subtitle=company or "Saved job"))

    apps = db.execute(
        select(Application.id, Application.role, Application.company, Application.status)
        .where(Application.owner_id == owner, has(Application.role, Application.company))
        .order_by(Application.updated_at.desc())
        .limit(PER_KIND)
    )
    for aid, role, company, status in apps:
        hits.append(
            SearchHit(kind="application", id=aid, title=role, subtitle=f"{company} · {status}")
        )

    letters = db.execute(
        select(CoverLetter.id, CoverLetter.title, CoverLetter.company)
        .where(CoverLetter.owner_id == owner, has(CoverLetter.title, CoverLetter.company))
        .order_by(CoverLetter.updated_at.desc())
        .limit(PER_KIND)
    )
    for lid, title, company in letters:
        hits.append(
            SearchHit(kind="cover_letter", id=lid, title=title, subtitle=company or "Cover letter")
        )

    proofs = db.execute(
        select(ProofTask.id, ProofTask.title, ProofTask.skill, ProofTask.status)
        .where(ProofTask.owner_id == owner, has(ProofTask.title, ProofTask.skill))
        .order_by(ProofTask.updated_at.desc())
        .limit(PER_KIND)
    )
    for pid, title, skill, status in proofs:
        hits.append(SearchHit(kind="proof", id=pid, title=title, subtitle=f"{skill} · {status}"))

    return SearchOut(query=q, hits=hits)
