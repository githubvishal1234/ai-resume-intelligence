"""Interview Story Bank: STAR stories grown from evidenced resume lines, tagged by theme."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import CurrentAuth
from app.core.access import ensure_access
from app.core.errors import NotFound
from app.db.session import get_db
from app.models import Resume, ResumeVersion, Story
from app.resumes.content import ResumeContent
from app.stories.suggest import STORIES_VERSION, suggest_stories

router = APIRouter(prefix="/stories", tags=["stories"])
DB = Annotated[Session, Depends(get_db)]

Theme = Literal[
    "conflict", "failure", "priorities", "leadership", "impact", "technical", "ownership",
    "collaboration",
]  # fmt: skip
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Part = Annotated[str, Field(max_length=3000)]


class StorySuggestionOut(BaseModel):
    entry_id: str
    source: str
    line: str
    title: str
    result: str
    themes: list[Theme]


class StorySuggestionsOut(BaseModel):
    method_version: str
    has_master: bool
    suggestions: list[StorySuggestionOut]


class StoryIn(BaseModel):
    title: Title
    situation: Part = ""
    task: Part = ""
    action: Part = ""
    result: Part = ""
    themes: list[Theme] = Field(default_factory=list, max_length=8)
    source_line: Part = ""
    source: Annotated[str, Field(max_length=200)] = ""


class StoryPatch(BaseModel):
    title: Title | None = None
    situation: Part | None = None
    task: Part | None = None
    action: Part | None = None
    result: Part | None = None
    themes: list[Theme] | None = Field(default=None, max_length=8)


class StoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    situation: str
    task: str
    action: str
    result: str
    themes: list[Theme]
    source_line: str
    source: str
    created_at: datetime
    updated_at: datetime


def _owned(db: Session, auth: CurrentAuth, story_id: uuid.UUID) -> Story:
    story = db.get(Story, story_id)
    if story is None:
        raise NotFound()
    ensure_access(auth.actor, story.owner_id)
    return story


@router.get("/suggestions", response_model=StorySuggestionsOut)
def suggestions(auth: CurrentAuth, db: DB) -> StorySuggestionsOut:
    owner = auth.actor.user_id
    content = db.scalar(
        select(ResumeVersion.content)
        .join(Resume, Resume.id == ResumeVersion.resume_id)
        .where(
            Resume.owner_id == owner,
            Resume.kind == "master",
            Resume.status == "active",
            ResumeVersion.version == Resume.current_version,
        )
    )
    if content is None:
        return StorySuggestionsOut(method_version=STORIES_VERSION, has_master=False, suggestions=[])
    used = set(db.scalars(select(Story.source_line).where(Story.owner_id == owner)))
    found = suggest_stories(ResumeContent.model_validate(content), used)
    return StorySuggestionsOut(
        method_version=STORIES_VERSION,
        has_master=True,
        suggestions=[StorySuggestionOut.model_validate(s, from_attributes=True) for s in found],
    )


@router.get("", response_model=list[StoryOut])
def list_stories(auth: CurrentAuth, db: DB) -> list[Story]:
    return list(
        db.scalars(
            select(Story)
            .where(Story.owner_id == auth.actor.user_id)
            .order_by(Story.updated_at.desc())
        )
    )


@router.post("", response_model=StoryOut, status_code=status.HTTP_201_CREATED)
def create_story(body: StoryIn, auth: CurrentAuth, db: DB) -> Story:
    story = Story(owner_id=auth.actor.user_id, **body.model_dump())
    story.themes = list(dict.fromkeys(body.themes))
    db.add(story)
    db.commit()
    return story


@router.patch("/{story_id}", response_model=StoryOut)
def update_story(story_id: uuid.UUID, body: StoryPatch, auth: CurrentAuth, db: DB) -> Story:
    story = _owned(db, auth, story_id)
    for name, value in body.model_dump(exclude_none=True).items():
        setattr(story, name, list(dict.fromkeys(value)) if name == "themes" else value)
    db.commit()
    return story


@router.delete("/{story_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_story(story_id: uuid.UUID, auth: CurrentAuth, db: DB) -> None:
    db.delete(_owned(db, auth, story_id))
    db.commit()
