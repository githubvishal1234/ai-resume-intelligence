"""Deterministic interview question bank (`interview-rules-v1`).

Questions come from three sources, and each one says why it was asked:
- the job's requirements and responsibilities,
- the resume's evidence for them (pointing at resume entity ids, as matching does),
- the skill gaps, so the user can prepare an honest answer.

Nothing here invents facts about the user: evidence is quoted from the resume, and gap
questions advise against claiming experience the resume does not show.
"""

from __future__ import annotations

import hashlib
from typing import Literal

from pydantic import BaseModel, Field

from app.jobs.analyzer import JobAnalysis
from app.matching.matcher import EvidenceRef, MatchResult
from app.resumes.content import ResumeContent

METHOD_VERSION = "interview-rules-v1"

Category = Literal["opening", "experience", "technical", "gap", "role", "behavioral"]

CATEGORY_ORDER: tuple[Category, ...] = (
    "opening",
    "experience",
    "technical",
    "gap",
    "role",
    "behavioral",
)

MAX_EXPERIENCE = 5
MAX_TECHNICAL = 6
MAX_GAPS = 4
MAX_ROLE = 3

STAR_TIP = (
    "Use STAR: the situation, your task, the actions you took yourself, and the result "
    "(with the numbers your resume already states)."
)

BEHAVIORAL: tuple[tuple[str, str, str], ...] = (
    (
        "conflict",
        "Tell me about a time you disagreed with a teammate or stakeholder. What happened?",
        "Show how you listen, decide with evidence, and keep the relationship working.",
    ),
    (
        "failure",
        "Describe a project or decision that didn't go as planned. What did you learn?",
        "Pick a real setback, own your part, and end with what you now do differently.",
    ),
    (
        "priorities",
        "How do you decide what to work on when everything feels urgent?",
        "Give your method (impact, effort, deadlines) and one example of using it.",
    ),
)


class Question(BaseModel):
    id: str
    category: Category
    text: str
    why: str
    requirement_ids: list[str] = Field(default_factory=list)
    evidence: list[EvidenceRef] = Field(default_factory=list)
    tips: list[str] = Field(default_factory=list)
    source: Literal["rules", "ai"] = "rules"


def _qid(category: str, key: str) -> str:
    return hashlib.sha256(f"{category}:{key.lower()}".encode()).hexdigest()[:12]


def _latest_role_evidence(resume: ResumeContent) -> list[EvidenceRef]:
    refs: list[EvidenceRef] = []
    if resume.summary:
        refs.append(
            EvidenceRef(
                kind="summary", entity_id=None, label="Summary", excerpt=resume.summary[:300]
            )
        )
    if resume.experience:
        e = resume.experience[0]
        label = " at ".join(p for p in (e.title, e.company) if p) or "Most recent role"
        refs.append(
            EvidenceRef(
                kind="experience",
                entity_id=e.id,
                label=label,
                excerpt=(e.bullets[0] if e.bullets else label)[:300],
            )
        )
    return refs


def build_questions(
    resume: ResumeContent, job: JobAnalysis, result: MatchResult, *, title: str, company: str | None
) -> list[Question]:
    questions: list[Question] = []
    at = f" at {company}" if company else ""

    def requirements_naming(skill: str) -> list[str]:
        return [r.id for r in job.requirements if skill in r.skills][:3]

    questions.append(
        Question(
            id=_qid("opening", "background"),
            category="opening",
            text=f"Walk me through your background, and why this {title} role{at}.",
            why="Most interviews open with this question.",
            evidence=_latest_role_evidence(resume),
            tips=[
                "Keep it to about two minutes: your current role, one or two results, and "
                "why this job is the next step.",
            ],
        )
    )

    # Requirements the resume already shows: ask for the story behind the evidence.
    shown = [
        r
        for tier in ("required", "preferred")
        for r in result.requirements
        if r.tier == tier
        and r.status in ("strong", "partial")
        and any(e.kind in ("experience", "project") for e in r.evidence)
    ]
    for r in shown[:MAX_EXPERIENCE]:
        refs = [e for e in r.evidence if e.kind in ("experience", "project")][:2]
        questions.append(
            Question(
                id=_qid("experience", r.requirement_id),
                category="experience",
                text=f"The role asks for: “{r.text.rstrip('.')}”. Which example from your "
                "work shows this best?",
                why=f"{r.tier.capitalize()} in the posting, and your resume has evidence for it.",
                requirement_ids=[r.requirement_id],
                evidence=refs,
                tips=[STAR_TIP, f"Your resume already points to: {refs[0].label}."],
            )
        )

    # Job skills the resume has: expect follow-up depth questions.
    have = [
        g
        for tier in ("required", "preferred")
        for g in result.skills
        if g.tier == tier and g.status in ("strong", "partial")
    ]
    for g in have[:MAX_TECHNICAL]:
        questions.append(
            Question(
                id=_qid("technical", g.skill),
                category="technical",
                text=f"How have you used {g.skill}, and what would you do differently next time?",
                why=f"{g.skill} is a {g.tier.replace('_', ' ')} skill for this job, and your "
                "resume mentions it.",
                requirement_ids=requirements_naming(g.skill),
                evidence=g.evidence[:2],
                tips=[
                    "Name a concrete project, its scale, and one trade-off you made.",
                    "Expect a follow-up that goes one level deeper than your answer.",
                ],
            )
        )

    # Gaps: prepare an honest answer instead of being caught out.
    gaps = [
        g
        for severity in ("critical", "high", "medium")
        for g in result.skills
        if g.severity == severity and not g.covered_by_alternative
    ]
    for g in gaps[:MAX_GAPS]:
        missing = g.status == "missing"
        text = (
            f"This role asks for {g.skill}, which your resume doesn't show. How would you "
            "handle that?"
            if missing
            else f"Your resume shows some {g.skill}. How deep is your experience with it?"
        )
        questions.append(
            Question(
                id=_qid("gap", g.skill),
                category="gap",
                text=text,
                why=f"Skill gap ({g.severity}): {g.skill} is {g.tier.replace('_', ' ')} for "
                "this job.",
                requirement_ids=requirements_naming(g.skill),
                evidence=g.evidence[:2],
                tips=[
                    "Don't claim experience you don't have; interviewers check.",
                    "Point to the closest thing you have done, and how you would get up to speed.",
                ],
            )
        )

    for resp in job.responsibilities[:MAX_ROLE]:
        questions.append(
            Question(
                id=_qid("role", resp),
                category="role",
                text=f"This role involves: “{resp.rstrip('.')}”. How would you approach it in "
                "your first few months?",
                why="Taken from the job's responsibilities.",
                tips=["Show how you would learn the context first, then one concrete first step."],
            )
        )

    for key, text, tip in BEHAVIORAL:
        questions.append(
            Question(
                id=_qid("behavioral", key),
                category="behavioral",
                text=text,
                why="A common behavioral question in most interviews.",
                tips=[STAR_TIP, tip],
            )
        )
    return questions
