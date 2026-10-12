"""The structured resume document stored in `resume_versions.content`.

Entities carry stable ids so later phases (matching evidence, tailoring changes) can point at
exactly the experience, bullet source, skill or project they rely on.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Short = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
Medium = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]
Long = Annotated[str, StringConstraints(strip_whitespace=True, max_length=5000)]
Bullet = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]
EntityId = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{1,40}$")]


def new_id() -> str:
    return uuid.uuid4().hex[:12]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Contact(_Strict):
    full_name: Short = ""
    email: Short = ""
    phone: Short = ""
    location: Short = ""
    links: list[Medium] = Field(default_factory=list, max_length=10)


class Experience(_Strict):
    id: EntityId = Field(default_factory=new_id)
    title: Short = ""
    company: Short = ""
    location: Short = ""
    start_date: Short = ""
    end_date: Short = ""
    current: bool = False
    bullets: list[Bullet] = Field(default_factory=list, max_length=40)


class Education(_Strict):
    id: EntityId = Field(default_factory=new_id)
    institution: Short = ""
    degree: Short = ""
    field_of_study: Short = ""
    start_date: Short = ""
    end_date: Short = ""
    details: list[Bullet] = Field(default_factory=list, max_length=20)


class Skill(_Strict):
    id: EntityId = Field(default_factory=new_id)
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    category: Short = ""


class Project(_Strict):
    id: EntityId = Field(default_factory=new_id)
    name: Short = ""
    url: Medium = ""
    description: Long = ""
    technologies: list[Short] = Field(default_factory=list, max_length=40)
    bullets: list[Bullet] = Field(default_factory=list, max_length=30)


class Certification(_Strict):
    id: EntityId = Field(default_factory=new_id)
    name: Short = ""
    issuer: Short = ""
    date: Short = ""


class OtherSection(_Strict):
    id: EntityId = Field(default_factory=new_id)
    heading: Short = ""
    lines: list[Bullet] = Field(default_factory=list, max_length=50)


class ResumeContent(_Strict):
    contact: Contact = Field(default_factory=Contact)
    summary: Long = ""
    experience: list[Experience] = Field(default_factory=list, max_length=50)
    education: list[Education] = Field(default_factory=list, max_length=20)
    skills: list[Skill] = Field(default_factory=list, max_length=200)
    projects: list[Project] = Field(default_factory=list, max_length=50)
    certifications: list[Certification] = Field(default_factory=list, max_length=50)
    other: list[OtherSection] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def _unique_ids(self) -> ResumeContent:
        seen: set[str] = set()
        groups: list[list[Experience] | list[Education] | list[Skill] | list[Project]
                     | list[Certification] | list[OtherSection]] = [
            self.experience, self.education, self.skills, self.projects,
            self.certifications, self.other,
        ]
        for group in groups:
            for entity in group:
                if entity.id in seen:
                    raise ValueError(f"Duplicate entity id '{entity.id}'.")
                seen.add(entity.id)
        return self

    def is_empty(self) -> bool:
        return self == ResumeContent()
