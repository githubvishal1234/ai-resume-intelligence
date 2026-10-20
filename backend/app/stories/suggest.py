"""Interview story suggestions from the resume (`stories-v1`). Deterministic; no AI.

A suggestion is one resume bullet turned into the start of a STAR story:
- Action is the bullet, word for word.
- Result is the clause of the bullet that carries a number, if there is one.
- Situation and Task are left for the user: the resume does not say them, so we never guess.
Themes come from plain verb and keyword rules, so each one can be explained.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.resumes.content import ResumeContent

STORIES_VERSION = "stories-v1"
MAX_SUGGESTIONS = 12

# The themes interview questions ask about; the first three match the behavioral questions.
THEMES = (
    "conflict",
    "failure",
    "priorities",
    "leadership",
    "impact",
    "technical",
    "ownership",
    "collaboration",
)

_RULES: dict[str, tuple[str, ...]] = {
    "leadership": ("led", "lead", "mentored", "managed", "coached", "hired", "guided", "headed"),
    "technical": (
        "migrated", "designed", "built", "architected", "implemented", "optimized",
        "automated", "developed", "engineered", "refactored", "scaled",
    ),
    "ownership": (
        "launched", "owned", "initiated", "founded", "drove", "spearheaded", "introduced",
        "created", "established",
    ),
    "collaboration": (
        "collaborated", "partnered", "cross-functional", "coordinated", "together", "teams",
        "stakeholders",
    ),
    "conflict": ("resolved", "negotiated", "convinced", "persuaded", "disagreement", "mediated"),
    "failure": ("recovered", "rescued", "incident", "outage", "postmortem", "turned around"),
    "priorities": ("prioritized", "deadline", "deadlines", "triaged", "roadmap", "balanced"),
}  # fmt: skip
# A measured outcome: percent, money, multiplier, size or duration ("3 engineers" is not one).
_MEASURE = re.compile(
    r"[$₹€£]\s?\d|\d+(?:[.,]\d+)?\s?(?:%|(?:x|k|m|gb|tb|ms|"
    r"seconds?|minutes?|hours?|days?|weeks?|months?)\b)",
    re.IGNORECASE,
)
_WORDS = re.compile(r"[a-z][a-z-]*")


@dataclass(frozen=True)
class Suggestion:
    entry_id: str
    source: str  # "Senior Engineer at Acme" or the project's name
    line: str  # the resume bullet, verbatim
    title: str
    result: str
    themes: list[str] = field(default_factory=list)


def themes_for(line: str) -> list[str]:
    text = line.lower()
    words = set(_WORDS.findall(text))
    found = [
        t for t, keys in _RULES.items() if any(k in words or (" " in k and k in text) for k in keys)
    ]
    if _MEASURE.search(line):
        found.append("impact")
    return [t for t in THEMES if t in found]


def result_clause(line: str) -> str:
    """The clause of a bullet that states a measured outcome, or "" if none does."""
    parts = re.split(r",\s+|;\s+", line.strip().rstrip("."))
    measured = [p.strip() for p in parts if _MEASURE.search(p)]
    return measured[-1] if measured else ""


def _title(line: str, words: int = 8) -> str:
    w = line.strip().rstrip(".").split()
    return " ".join(w[:words]) + ("…" if len(w) > words else "")


def suggest_stories(resume: ResumeContent, used_lines: set[str]) -> list[Suggestion]:
    out: list[Suggestion] = []
    pool: list[tuple[str, str, str]] = []
    for e in resume.experience:
        source = " at ".join(p for p in (e.title, e.company) if p) or "Experience"
        pool += [(e.id, source, b) for b in e.bullets]
    for p in resume.projects:
        pool += [(p.id, p.name or "Project", b) for b in p.bullets]
    for entry_id, source, raw in pool:
        line = raw.strip()
        if len(line) < 12 or line in used_lines:
            continue
        themes = themes_for(line)
        if not themes:
            continue
        out.append(Suggestion(entry_id, source, line, _title(line), result_clause(line), themes))
    # Lines with a measurable result and more themes make the strongest stories.
    out.sort(key=lambda s: (not s.result, -len(s.themes)))
    return out[:MAX_SUGGESTIONS]
