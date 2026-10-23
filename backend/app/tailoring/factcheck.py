"""Factual-consistency check, layer 1 (deterministic).

Any text that would go into a tailored resume is compared with the master resume. Numbers,
years, technologies and capitalized names that the master does not contain are flagged: they
may be true, but the resume never said so, and the user has to fix or remove them.
"""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel

from app.resumes.content import ResumeContent
from app.skills.vocabulary import find_skills

FlagKind = Literal["number", "date", "technology", "name", "claim"]


class FactFlag(BaseModel):
    kind: FlagKind
    value: str
    message: str
    # "block": the change cannot be accepted until fixed (layer 1).
    # "warn": shown for the user to judge (layer 2, see claims.py).
    severity: Literal["block", "warn"] = "block"


def blocking(flags: list[dict[str, object]]) -> list[dict[str, object]]:
    return [f for f in flags if f.get("severity", "block") == "block"]


_NUMBER = re.compile(r"(?<![\w.])\d+(?:[.,]\d+)*(?:\s?%|[kKmMbB]\b|x\b)?")
_YEAR = re.compile(r"^(?:19|20)\d{2}$")
_CAPITALIZED = re.compile(r"(?<![\w'])([A-Z][\w&.+-]*(?:\s+[A-Z][\w&.+-]*)*)")
_COMMON_WORDS = (
    "I A An The This That These Those We Our My Me And Or But With For In On At To Of By "
    "Led Built Designed Developed Delivered Drove Improved Increased Reduced Managed Created "
    "Owned Launched Implemented Hands-on Experience Experienced Skilled Proven Strong"
)
_COMMON = frozenset(_COMMON_WORDS.split())
# Unicode hyphens and dashes that models write ("AI‑powered"), read as a plain hyphen.
_ADJ_SUFFIX = re.compile(r"(?<=\w)-[a-z]+$")
_DASHES = re.compile("[‐-―−]")
# A sentence's opening verb ("Engineered", "Architected", "Optimizing"): capitalized only
# because it starts the sentence, so it is not a name.
_OPENING_VERB = re.compile(r"[A-Z][a-z]+(?:ed|ing)")


def master_text(master: ResumeContent) -> str:
    c = master
    parts: list[str] = [c.contact.full_name, c.contact.location, c.summary]
    for e in c.experience:
        parts += [e.title, e.company, e.location, e.start_date, e.end_date, *e.bullets]
    for d in c.education:
        parts += [d.institution, d.degree, d.field_of_study, d.start_date, d.end_date, *d.details]
    parts += [s.name for s in c.skills]
    for p in c.projects:
        parts += [p.name, p.description, *p.technologies, *p.bullets]
    for x in c.certifications:
        parts += [x.name, x.issuer, x.date]
    for o in c.other:
        parts += [o.heading, *o.lines]
    return "\n".join(p for p in parts if p)


def known_skills(master: ResumeContent) -> set[str]:
    """Skills the master resume shows anywhere; any other skill in new text is flagged."""
    corpus = master_text(master)
    return set(find_skills(corpus)) | set(find_skills(corpus, prose=False))


def _norm_number(value: str) -> str:
    return re.sub(r"[\s,]", "", value).lower()


def check_text(text: str, master: ResumeContent) -> list[FactFlag]:
    text = _DASHES.sub("-", text)
    corpus = _DASHES.sub("-", master_text(master))
    lowered = corpus.lower()
    known_numbers = {_norm_number(n) for n in _NUMBER.findall(corpus)}
    known_numbers |= {re.sub(r"%$", "", n) for n in known_numbers}
    shown = known_skills(master)
    flags: list[FactFlag] = []
    seen: set[tuple[str, str]] = set()

    def add(kind: FlagKind, value: str, message: str) -> None:
        if (kind, value.lower()) not in seen:
            seen.add((kind, value.lower()))
            flags.append(FactFlag(kind=kind, value=value, message=message))

    for raw in _NUMBER.findall(text):
        n = _norm_number(raw)
        if n in known_numbers or re.sub(r"%$", "", n) in known_numbers:
            continue
        if _YEAR.match(n):
            add("date", raw, f"The year {raw} does not appear in your master resume.")
        else:
            add("number", raw.strip(), f"“{raw.strip()}” does not appear in your master resume.")

    for skill in find_skills(text):
        if skill not in shown:
            add("technology", skill, f"Your master resume does not mention {skill}.")

    skills_in_text = {s.lower() for s in find_skills(text)}
    for sentence in re.split(r"(?<=[.!?])\s+|\n", text):
        for i, match in enumerate(_CAPITALIZED.finditer(sentence)):
            name = match.group(1).strip(".")
            tokens = name.split()
            if i == 0 and match.start() == len(sentence) - len(sentence.lstrip()):
                if len(tokens) == 1:
                    continue  # a sentence's first word
                if _OPENING_VERB.fullmatch(tokens[0]):
                    tokens = tokens[1:]  # "Engineered AI-powered HRMS": check what follows
            # "SQL-driven", "AI-enabled": only the head can be a name.
            words = [_ADJ_SUFFIX.sub("", w) for w in tokens if w not in _COMMON]
            if not words:
                continue
            candidate = " ".join(words)
            if (
                not candidate
                or candidate.lower() in lowered
                or candidate.lower() in skills_in_text
                or all(w.lower() in lowered for w in words)
            ):
                continue
            add("name", candidate, f"“{candidate}” does not appear in your master resume.")
    return flags
