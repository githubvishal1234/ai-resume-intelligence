"""Evidence-backed cover letter drafts (`letter-v1`). Deterministic; no AI.

Every factual sentence in a draft comes from the resume itself: the opening reuses the
resume's own summary, and each body paragraph pairs one of the job's requirements (that the
matcher found strong evidence for) with the full resume bullet behind it. Nothing the resume
does not say is added, so the draft cannot invent experience. The user edits from there.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.matching.matcher import MatchResult
from app.resumes.content import ResumeContent
from app.skills.vocabulary import canonical

LETTER_VERSION = "letter-v1"
MAX_POINTS = 3

# A bullet that opens with one of these reads naturally after "I".
_IRREGULAR = {
    "built", "led", "ran", "made", "wrote", "grew", "cut", "won", "drove", "took", "set",
    "brought", "taught", "sold", "kept", "held", "met", "spent", "found", "got", "gave",
    "own", "build", "lead", "design", "manage", "run",
}  # fmt: skip


@dataclass(frozen=True)
class Point:
    requirement: str
    excerpt: str  # the full resume line quoted
    source: str  # "Senior Engineer at Acme" or a project name


@dataclass(frozen=True)
class Draft:
    title: str
    company: str
    body: str
    points: list[Point]


def _first_sentence(text: str, limit: int = 260) -> str:
    text = " ".join(text.split())
    m = re.match(r"(.+?[.!?])(\s|$)", text)
    s = m.group(1) if m else text
    return s if len(s) <= limit else s[:limit].rsplit(" ", 1)[0] + "…"


def _as_clause(bullet: str) -> str:
    """Turn "Led the migration…" into "I led the migration…" when it starts with a verb."""
    b = bullet.strip().rstrip(".")
    first = b.split(" ", 1)[0].lower()
    if first.endswith("ed") or first in _IRREGULAR:
        return "I " + b[0].lower() + b[1:]
    return "one result: " + b


def _full_line(resume: ResumeContent, kind: str, entity_id: str | None, excerpt: str) -> str | None:
    """The complete bullet behind a (possibly truncated) excerpt, or None if it is not a bullet.

    Evidence can also be a role's dates or title (for years of experience); those are not
    achievements and are never quoted as one.
    """
    stem = excerpt.rstrip("…").strip()
    pools: list[list[str]] = []
    if kind == "experience":
        pools = [e.bullets for e in resume.experience if e.id == entity_id]
    elif kind == "project":
        pools = [p.bullets + [p.description] for p in resume.projects if p.id == entity_id]
    for pool in pools:
        for line in pool:
            if line and line.strip().startswith(stem[:60]):
                return line.strip()
    return None


def _lead_in(requirement: str) -> str:
    """Lowercase the first letter for mid-sentence use, unless it starts a name ("Kubernetes")."""
    first = requirement.split(" ", 1)[0].strip(",.;:")
    if canonical(first) or (len(first) > 1 and first[1:].lower() != first[1:]):
        return requirement
    return requirement[0].lower() + requirement[1:]


def _short(text: str, limit: int = 90) -> str:
    text = " ".join(text.split()).rstrip(".")
    return text if len(text) <= limit else text[:limit].rsplit(" ", 1)[0] + "…"


def draft_letter(
    resume: ResumeContent,
    job_title: str | None,
    company: str | None,
    match: MatchResult | None,
) -> Draft:
    role = (job_title or "").strip()
    org = (company or "").strip()
    points: list[Point] = []
    used: set[str] = set()
    if match is not None:
        order = {"required": 0, "preferred": 1, "nice_to_have": 2}
        for req in sorted(match.requirements, key=lambda r: order.get(r.tier, 3)):
            if req.status != "strong":
                continue
            ref = next((e for e in req.evidence if e.kind in ("experience", "project")), None)
            if ref is None:
                continue
            line = _full_line(resume, ref.kind, ref.entity_id, ref.excerpt)
            if line is None or line in used:
                continue
            used.add(line)
            points.append(Point(_short(req.text), line, ref.label))
            if len(points) == MAX_POINTS:
                break
    if not points and resume.experience:  # no job, or nothing matched: lead with the latest role
        latest = resume.experience[0]
        source = " at ".join(p for p in (latest.title, latest.company) if p) or "my latest role"
        for line in [b for b in latest.bullets if b.strip()][:2]:
            points.append(Point("", line.strip(), source))

    paragraphs: list[str] = []
    opening = f"I'm writing to apply for the {role} role" if role else "I'm writing to apply"
    opening += f" at {org}." if org else "."
    if resume.summary.strip():
        opening += " " + _first_sentence(resume.summary)
    paragraphs.append(opening)
    for p in points:
        where = f"As {p.source}" if " at " in p.source else f"In {p.source}"
        if p.requirement:
            ask = _lead_in(p.requirement)
            paragraphs.append(f"You're looking for {ask}. {where}, {_as_clause(p.excerpt)}.")
        else:
            paragraphs.append(f"{where}, {_as_clause(p.excerpt)}.")
    closing = "I'd welcome the chance to talk about how I could help"
    closing += f" {org}." if org else " your team."
    closing += " Thank you for your time and consideration."
    paragraphs.append(closing)

    title = f"Cover letter: {role}" if role else "Cover letter"
    if org:
        title += f" at {org}"
    return Draft(title=title[:200], company=org[:200], body="\n\n".join(paragraphs), points=points)
