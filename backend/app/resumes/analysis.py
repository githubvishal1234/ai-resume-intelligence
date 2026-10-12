"""Rule-based resume analysis (no AI). Each check states what it looked at and why it matters.

The score is the weighted share of checks passed. It measures completeness and writing hygiene
against well-known resume conventions; it is not a prediction of hiring outcomes.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

from app.resumes.content import ResumeContent

METHOD_VERSION = "rules-v1"
Status = Literal["pass", "warn", "fail"]

ACTION_VERBS = frozenset(
    """
    accelerated achieved administered analyzed architected automated built championed coached
    collaborated completed conceived consolidated coordinated created cut decreased defined
    delivered deployed designed developed directed drove eliminated enabled engineered
    established evaluated executed expanded facilitated founded generated grew guided handled
    headed implemented improved increased initiated innovated instituted integrated introduced
    launched led maintained managed mentored migrated modernized negotiated optimized
    orchestrated organized overhauled owned partnered performed pioneered planned prepared
    presented produced programmed published raised re-architected rebuilt redesigned reduced
    refactored resolved restructured revamped saved scaled secured shipped simplified solved
    spearheaded standardized streamlined strengthened supervised supported taught tested
    trained transformed tripled troubleshot unified upgraded won wrote
    """.split()  # noqa: SIM905 - a word list reads better than a 100-item literal
)
FIRST_PERSON = re.compile(r"\b(I|me|my|mine|myself)\b")
NUMBER = re.compile(r"\d")


@dataclass(frozen=True)
class Check:
    id: str
    title: str
    section: str
    status: Status
    detail: str
    weight: int


def _count(n: int, singular: str, plural: str | None = None) -> str:
    return f"{n} {singular if n == 1 else (plural or singular + 's')}"


def _all_bullets(content: ResumeContent) -> list[str]:
    bullets = [b for e in content.experience for b in e.bullets]
    bullets += [b for p in content.projects for b in p.bullets]
    return bullets


def _word_count(content: ResumeContent) -> int:
    parts = [content.summary]
    for e in content.experience:
        parts += [e.title, e.company, *e.bullets]
    for ed in content.education:
        parts += [ed.institution, ed.degree, ed.field_of_study, *ed.details]
    parts += [s.name for s in content.skills]
    for p in content.projects:
        parts += [p.name, p.description, *p.bullets]
    parts += [c.name for c in content.certifications]
    for o in content.other:
        parts += o.lines
    return sum(len(x.split()) for x in parts)


def analyze(content: ResumeContent) -> tuple[int, list[Check]]:
    checks: list[Check] = []

    def add(id_: str, title: str, section: str, status: Status, detail: str, weight: int) -> None:
        checks.append(Check(id_, title, section, status, detail, weight))

    c = content.contact
    add("contact.name", "Name is present", "contact", "pass" if c.full_name else "fail",
        "Recruiters and applicant tracking systems need your name at the top."
        if not c.full_name else "Found.", 3)
    add("contact.email", "Email is present", "contact", "pass" if c.email else "fail",
        "Add an email address so employers can reach you." if not c.email else "Found.", 3)
    add("contact.phone", "Phone number is present", "contact", "pass" if c.phone else "warn",
        "Many employers still call first; consider adding a phone number."
        if not c.phone else "Found.", 1)

    words = len(content.summary.split())
    if not content.summary:
        add("summary.present", "Summary", "summary", "warn",
            "A 2-4 sentence summary helps a reader place you quickly.", 2)
    elif words < 20 or words > 120:
        add("summary.present", "Summary length", "summary", "warn",
            f"Your summary has {words} words; 20-120 words is easier to scan.", 2)
    else:
        add("summary.present", "Summary length", "summary", "pass", f"{words} words.", 2)

    roles = content.experience
    if not roles:
        add("experience.present", "Work experience", "experience", "fail",
            "No work experience entries. Add roles, internships or relevant projects.", 4)
    else:
        add("experience.present", "Work experience", "experience", "pass",
            _count(len(roles), "role") + ".", 4)
        undated = [r for r in roles if not r.start_date]
        add("experience.dates", "Every role has dates", "experience",
            "pass" if not undated else "fail",
            "All roles are dated." if not undated else
            f"{_count(len(undated), 'role')} without a start date. Dates let readers see your "
            "progression.",
            3)
        thin = [r for r in roles if len(r.bullets) < 2]
        add("experience.bullets", "Roles describe what you did", "experience",
            "pass" if not thin else "warn",
            "Each role has at least two bullet points." if not thin else
            f"{_count(len(thin), 'role')} with fewer than two bullet points.", 3)

    bullets = _all_bullets(content)
    if bullets:
        quantified = sum(1 for b in bullets if NUMBER.search(b))
        share = quantified / len(bullets)
        add("bullets.quantified", "Results are quantified", "experience",
            "pass" if share >= 0.3 else "warn",
            f"{quantified} of {len(bullets)} bullet points include a number "
            "(aim for at least 30%). Numbers make impact concrete.", 3)
        verbs = sum(
            1 for b in bullets
            if (b.split()[0].lower().strip(".,;:") if b.split() else "") in ACTION_VERBS
        )
        vshare = verbs / len(bullets)
        add("bullets.action_verbs", "Bullets start with action verbs", "experience",
            "pass" if vshare >= 0.6 else "warn",
            f"{verbs} of {len(bullets)} bullet points start with a recognized action verb "
            "(e.g. 'Led', 'Built', 'Reduced').", 2)
        long_ones = [b for b in bullets if len(b.split()) > 40]
        add("bullets.length", "Bullets are concise", "experience",
            "pass" if not long_ones else "warn",
            "All bullet points are 40 words or fewer." if not long_ones else
            f"{_count(len(long_ones), 'bullet point')} longer than 40 words; split or tighten "
            "them.",
            1)

    text = " ".join([content.summary, *bullets])
    first_person = FIRST_PERSON.findall(text)
    add("style.first_person", "No first-person pronouns", "style",
        "pass" if not first_person else "warn",
        "Resumes conventionally omit 'I' and 'my'." if first_person else "None found.", 1)

    add("education.present", "Education", "education", "pass" if content.education else "warn",
        _count(len(content.education), "entry", "entries") + "." if content.education else
        "No education entries. Add degrees, diplomas or relevant training if you have them.", 2)

    n_skills = len(content.skills)
    add("skills.count", "Skills listed", "skills",
        "pass" if n_skills >= 5 else "warn" if n_skills else "fail",
        f"{_count(n_skills, 'skill')}. Listing at least 5 concrete skills helps keyword "
        "matching.", 3)

    total = _word_count(content)
    add("length.words", "Overall length", "style",
        "pass" if 250 <= total <= 1100 else "warn",
        f"About {total} words. Most one-to-two page resumes fall between 250 and 1,100 words.", 1)

    earned = sum(ch.weight * (1.0 if ch.status == "pass" else 0.5 if ch.status == "warn" else 0)
                 for ch in checks)
    possible = sum(ch.weight for ch in checks)
    score = round(100 * earned / possible) if possible else 0
    return score, checks
