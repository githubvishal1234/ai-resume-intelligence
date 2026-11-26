"""Jobs for a resume (`jobsearch-v1`): the search words come from the resume, and each opening
is ranked by how many of the skills it mentions the resume backs up.

Only the listing's title and description snippet are read, so a skill the full posting asks
for can be missing here; the page says so. Evidence uses the matching rules: a skill shown in
a role or project is "shown", one only listed under Skills is "listed".
"""

from __future__ import annotations

from dataclasses import dataclass

from app.jobsearch.adzuna import Listing
from app.matching.matcher import _index, _skill_status
from app.resumes.content import ResumeContent
from app.skills.vocabulary import find_skills

METHOD_VERSION = "jobsearch-v1"


@dataclass(frozen=True)
class Ranked:
    listing: Listing
    shown: list[str]  # skills the resume shows in a role or project
    listed: list[str]  # skills the resume only lists
    missing: list[str]  # skills the listing mentions that the resume does not have


def default_query(resume: ResumeContent) -> tuple[str, str]:
    """(what, where): the latest role's title, else the headline, else the top skills; and the
    city from the contact location ("Bengaluru, India" -> "Bengaluru")."""
    title = next((e.title for e in resume.experience if e.title.strip()), "")
    what = title or resume.contact.headline or " ".join(s.name for s in resume.skills[:3])
    where = resume.contact.location.split(",")[0]
    return " ".join(what.split())[:100], " ".join(where.split())[:100]


def rank(listings: list[Listing], resume: ResumeContent) -> list[Ranked]:
    index = _index(resume)
    ranked: list[Ranked] = []
    for item in listings:
        found: dict[str, list[str]] = {"strong": [], "partial": [], "missing": []}
        for skill in find_skills(f"{item.title}\n{item.description}"):
            found[_skill_status(index, skill)[0]].append(skill)
        ranked.append(Ranked(item, found["strong"], found["partial"], found["missing"]))
    # Most backed-up skills first; the search's own order breaks ties (sort is stable).
    return sorted(ranked, key=lambda r: len(r.shown) * 2 + len(r.listed), reverse=True)
