"""Rule-based resume-to-job matching (`match-rules-v1`).

Everything here is explainable: each requirement gets a status (strong / partial / missing)
with the resume entities that support it, and every subscore says how it was computed.
Nothing is inferred beyond what the resume text contains. The subscore weights are an
engineering default pending Decision Register D-11.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.jobs.analyzer import JobAnalysis, Requirement, Tier
from app.resumes.analysis import analyze as analyze_resume
from app.resumes.content import ResumeContent
from app.skills.vocabulary import canonical, find_skills

METHOD_VERSION = "match-rules-v1"
Status = Literal["strong", "partial", "missing"]
Severity = Literal["critical", "high", "medium", "low"]
SubscoreKey = Literal["skills", "experience", "keywords", "education", "ats"]
EntityKind = Literal["experience", "project", "skill", "education", "certification", "summary"]

# Engineering default (D-11). Subscores that do not apply are left out and the rest renormalized.
WEIGHTS: dict[SubscoreKey, int] = {
    "skills": 40,
    "experience": 20,
    "keywords": 15,
    "education": 10,
    "ats": 15,
}
TIER_WEIGHT: dict[Tier, int] = {"required": 3, "preferred": 2, "nice_to_have": 1}
STATUS_CREDIT: dict[Status, float] = {"strong": 1.0, "partial": 0.5, "missing": 0.0}


class EvidenceRef(BaseModel):
    kind: EntityKind
    entity_id: str | None
    label: str
    excerpt: str


class RequirementMatch(BaseModel):
    requirement_id: str
    text: str
    tier: Tier
    category: str
    status: Status
    reason: str
    evidence: list[EvidenceRef] = Field(default_factory=list)


class SkillGap(BaseModel):
    skill: str
    tier: Tier
    status: Status
    severity: Severity | None
    # The requirements naming this skill are already met through an alternative ("A or B").
    covered_by_alternative: bool = False
    evidence: list[EvidenceRef] = Field(default_factory=list)


class Subscore(BaseModel):
    key: SubscoreKey
    label: str
    score: int | None  # None: does not apply to this job
    weight: int
    explanation: str


class MatchResult(BaseModel):
    method_version: str = METHOD_VERSION
    overall: int
    subscores: list[Subscore]
    requirements: list[RequirementMatch]
    skills: list[SkillGap]
    resume_years: float | None
    keywords_matched: list[str]
    keywords_missing: list[str]


# ---- resume index ----------------------------------------------------------------------
@dataclass
class _Index:
    """Where each canonical skill appears in the resume, and the resume's plain text."""

    used: dict[str, list[EvidenceRef]] = field(default_factory=dict)  # experience / projects
    listed: dict[str, list[EvidenceRef]] = field(default_factory=dict)  # skills section etc.
    text: str = ""


def _excerpt(text: str, limit: int = 160) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _add(target: dict[str, list[EvidenceRef]], skill: str, ref: EvidenceRef) -> None:
    refs = target.setdefault(skill, [])
    if len(refs) < 3 and not any(r.entity_id == ref.entity_id for r in refs):
        refs.append(ref)


def _index(resume: ResumeContent) -> _Index:
    index = _Index()
    parts: list[str] = [resume.summary]
    for exp in resume.experience:
        label = " at ".join(p for p in (exp.title, exp.company) if p) or "Experience"
        for bullet in exp.bullets:
            for skill in find_skills(bullet):
                _add(
                    index.used,
                    skill,
                    EvidenceRef(
                        kind="experience", entity_id=exp.id, label=label, excerpt=_excerpt(bullet)
                    ),
                )
        head = f"{exp.title} {exp.company}"
        for skill in find_skills(head):
            _add(
                index.used,
                skill,
                EvidenceRef(
                    kind="experience", entity_id=exp.id, label=label, excerpt=_excerpt(head)
                ),
            )
        parts += [exp.title, exp.company, *exp.bullets]
    for proj in resume.projects:
        label = proj.name or "Project"
        for tech in proj.technologies:
            name = canonical(tech)
            if name:
                _add(
                    index.used,
                    name,
                    EvidenceRef(
                        kind="project",
                        entity_id=proj.id,
                        label=label,
                        excerpt=_excerpt(", ".join(proj.technologies)),
                    ),
                )
        for line in [proj.description, *proj.bullets]:
            for skill in find_skills(line):
                _add(
                    index.used,
                    skill,
                    EvidenceRef(
                        kind="project", entity_id=proj.id, label=label, excerpt=_excerpt(line)
                    ),
                )
        parts += [proj.name, proj.description, *proj.technologies, *proj.bullets]
    for item in resume.skills:
        names = (
            [canonical(item.name)] if canonical(item.name) else find_skills(item.name, prose=False)
        )
        for name in names:
            if name:
                _add(
                    index.listed,
                    name,
                    EvidenceRef(kind="skill", entity_id=item.id, label="Skills", excerpt=item.name),
                )
        parts.append(item.name)
    for skill in find_skills(resume.summary):
        _add(
            index.listed,
            skill,
            EvidenceRef(
                kind="summary", entity_id=None, label="Summary", excerpt=_excerpt(resume.summary)
            ),
        )
    for cert in resume.certifications:
        parts += [cert.name, cert.issuer]
    for edu in resume.education:
        parts += [edu.degree, edu.field_of_study, edu.institution, *edu.details]
    for other in resume.other:
        parts += [other.heading, *other.lines]
    index.text = "\n".join(p for p in parts if p)
    return index


def _skill_status(index: _Index, skill: str) -> tuple[Status, list[EvidenceRef]]:
    if skill in index.used:
        return "strong", index.used[skill] + index.listed.get(skill, [])[:1]
    if skill in index.listed:
        return "partial", index.listed[skill]
    return "missing", []


# ---- experience dates ------------------------------------------------------------------
_MONTHS = {
    m: i
    for i, m in enumerate(
        ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"],
        start=1,
    )
}
_PRESENT = re.compile(r"^(present|current|now|today|ongoing|till date|to date)$", re.I)


def parse_month(value: str, today: date) -> tuple[int, int] | None:
    """(year, month) from 'Jan 2021', 'January 2021', '01/2021', '2021-01', '2021' or 'Present'."""
    value = value.strip().rstrip(".")
    if not value:
        return None
    if _PRESENT.match(value):
        return today.year, today.month
    if m := re.fullmatch(r"([A-Za-z]{3,9})\.?\s*,?\s*(\d{4})", value):
        month = _MONTHS.get(m.group(1)[:3].lower())
        return (int(m.group(2)), month) if month else None
    if m := re.fullmatch(r"(\d{1,2})\s*/\s*(\d{4})", value):
        month = int(m.group(1))
        return (int(m.group(2)), month) if 1 <= month <= 12 else None
    if m := re.fullmatch(r"(\d{4})\s*-\s*(\d{1,2})", value):
        month = int(m.group(2))
        return (int(m.group(1)), month) if 1 <= month <= 12 else None
    if m := re.fullmatch(r"(19|20)\d{2}", value):
        return int(m.group(0)), 1
    return None


def experience_years(resume: ResumeContent, today: date) -> tuple[float | None, int]:
    """Total years across roles (overlaps counted once) and how many roles could not be dated."""
    spans: list[tuple[int, int]] = []
    undated = 0
    for exp in resume.experience:
        start = parse_month(exp.start_date, today)
        end = (today.year, today.month) if exp.current else parse_month(exp.end_date, today)
        if start is None or end is None:
            undated += 1
            continue
        a, b = start[0] * 12 + start[1], end[0] * 12 + end[1] + 1
        if b > a:
            spans.append((a, b))
    if not spans:
        return None, undated
    spans.sort()
    total, (cur_a, cur_b) = 0, spans[0]
    for a, b in spans[1:]:
        if a <= cur_b:
            cur_b = max(cur_b, b)
        else:
            total += cur_b - cur_a
            cur_a, cur_b = a, b
    total += cur_b - cur_a
    return round(total / 12, 1), undated


# ---- education -------------------------------------------------------------------------
_EDU_RANK = {"Doctorate": 4, "Master's": 3, "Bachelor's": 2, "Associate": 1}


def _edu_rank(degree: str) -> int:
    d = degree.lower()
    if re.search(r"\b(ph\.?d|doctor|d\.phil)", d):
        return 4
    if re.search(r"\b(master|m\.?s\b|m\.?sc|mba|m\.?tech|m\.?e\b|m\.?a\b|mca)", d):
        return 3
    if re.search(r"\b(bachelor|b\.?s\b|b\.?sc|b\.?tech|b\.?e\b|b\.?a\b|bca|undergraduate)", d):
        return 2
    if re.search(r"\b(associate|diploma)", d):
        return 1
    return 0


# ---- words -----------------------------------------------------------------------------
_WORD = re.compile(r"[a-z][a-z+#.-]{2,}")
_FILLER_WORDS = (
    "and the for with our you your are will have has this that from into across able "
    "experience years year strong solid proven knowledge working work skills ability "
    "using use including related field equivalent plus preferred required must good "
    "excellent familiarity understanding other such least"
)
_FILLER = frozenset(_FILLER_WORDS.split())


def _words(text: str) -> set[str]:
    return {w.strip(".-") for w in _WORD.findall(text.lower())} - _FILLER


# ---- requirement matching --------------------------------------------------------------
def _match_requirement(
    req: Requirement,
    resume: ResumeContent,
    index: _Index,
    years: float | None,
    undated: int,
    resume_words: set[str],
) -> RequirementMatch:
    base = {"requirement_id": req.id, "text": req.text, "tier": req.tier, "category": req.category}

    if req.category == "experience" and req.years is not None:
        refs = [
            EvidenceRef(
                kind="experience",
                entity_id=e.id,
                label=" at ".join(p for p in (e.title, e.company) if p) or "Experience",
                excerpt=f"{e.start_date} – {'Present' if e.current else e.end_date}".strip(" –"),
            )
            for e in resume.experience[:3]
        ]
        if years is None:
            return RequirementMatch(
                **base,
                status="partial" if resume.experience else "missing",
                reason="Your roles have no dates we could read, so total experience is unknown."
                if resume.experience
                else "No work experience is listed.",
                evidence=refs,
            )
        note = (
            f" ({undated} undated role{'s' if undated != 1 else ''} not counted)" if undated else ""
        )
        if years >= req.years:
            status: Status = "strong"
        elif years >= req.years * 0.7:
            status = "partial"
        else:
            status = "missing"
        return RequirementMatch(
            **base,
            status=status,
            reason=(
                f"About {years:g} years of dated experience{note}; "
                f"the posting asks for {req.years}+."
            ),
            evidence=refs,
        )

    if req.category == "education":
        wanted = 0
        for name, rank in _EDU_RANK.items():
            if re.search(name.split("'")[0], req.text, re.I):
                wanted = max(wanted, rank)
        wanted = wanted or _edu_rank(req.text) or 2
        best = max(resume.education, key=lambda e: _edu_rank(e.degree), default=None)
        if best is None:
            return RequirementMatch(**base, status="missing", reason="No education is listed.")
        ref = EvidenceRef(
            kind="education",
            entity_id=best.id,
            label=best.institution or "Education",
            excerpt=_excerpt(" in ".join(p for p in (best.degree, best.field_of_study) if p)),
        )
        rank = _edu_rank(best.degree)
        if rank >= wanted:
            return RequirementMatch(
                **base, status="strong", reason="Your degree meets this level.", evidence=[ref]
            )
        reason = (
            "We could not tell the level of your degree from its name."
            if rank == 0
            else "Your highest listed degree is below the level asked for."
        )
        return RequirementMatch(**base, status="partial", reason=reason, evidence=[ref])

    if req.category == "certification":
        hits = [
            c
            for c in resume.certifications
            if (req.skills and any(s.lower() in f"{c.name} {c.issuer}".lower() for s in req.skills))
            or len(_words(c.name) & _words(req.text)) >= 2
        ]
        if hits:
            refs = [
                EvidenceRef(
                    kind="certification",
                    entity_id=c.id,
                    label="Certification",
                    excerpt=_excerpt(c.name),
                )
                for c in hits[:3]
            ]
            return RequirementMatch(
                **base, status="strong", reason="A listed certification matches.", evidence=refs
            )
        if req.skills and any(_skill_status(index, s)[0] != "missing" for s in req.skills):
            refs = [r for s in req.skills for r in _skill_status(index, s)[1]][:3]
            return RequirementMatch(
                **base,
                status="partial",
                reason="You list the skill but not the certification.",
                evidence=refs,
            )
        return RequirementMatch(
            **base, status="missing", reason="No matching certification is listed."
        )

    if req.skills:
        statuses = {s: _skill_status(index, s) for s in req.skills}
        found = [s for s, (st, _) in statuses.items() if st != "missing"]
        strong = [s for s, (st, _) in statuses.items() if st == "strong"]
        refs = [r for s in found for r in statuses[s][1]][:4]
        # "A or B" requirements are satisfied by any one of them.
        alternatives = bool(re.search(r"\bor\b|/", req.text, re.I))
        if strong and (alternatives or len(strong) == len(req.skills)):
            status = "strong"
        elif found:
            status = "partial"
        else:
            status = "missing"
        missing = [s for s in req.skills if s not in found]
        if status == "strong":
            reason = f"Used in your experience or projects: {', '.join(strong)}."
        elif status == "partial":
            listed_only = [s for s in found if s not in strong]
            bits = []
            if strong:
                bits.append(f"shown in your work: {', '.join(strong)}")
            if listed_only:
                bits.append(f"listed but not shown in a role or project: {', '.join(listed_only)}")
            if missing and not alternatives:
                bits.append(f"not found: {', '.join(missing)}")
            detail = "; ".join(bits)
            reason = f"Partly covered. {detail[:1].upper()}{detail[1:]}."
        else:
            reason = f"Not found in your resume: {', '.join(req.skills)}."
        return RequirementMatch(**base, status=status, reason=reason, evidence=refs)

    # No recognizable skill: compare meaningful words (an approximation, and labelled as one).
    wanted_words = _words(req.text)
    if not wanted_words:
        return RequirementMatch(
            **base, status="missing", reason="Nothing in this requirement could be compared."
        )
    overlap = wanted_words & resume_words
    ratio = len(overlap) / len(wanted_words)
    status = "strong" if ratio >= 0.6 else "partial" if ratio >= 0.3 else "missing"
    shown = ", ".join(sorted(overlap)[:6])
    reason = (
        f"Word overlap only (no known skill named): {len(overlap)} of {len(wanted_words)} key words"
        + (f" appear in your resume ({shown})." if overlap else " appear in your resume.")
    )
    return RequirementMatch(**base, status=status, reason=reason)


_SEVERITY: dict[tuple[Tier, Status], Severity] = {
    ("required", "missing"): "critical",
    ("preferred", "missing"): "high",
    ("required", "partial"): "medium",
    ("preferred", "partial"): "low",
    ("nice_to_have", "missing"): "low",
    ("nice_to_have", "partial"): "low",
}


def _severity(tier: Tier, status: Status) -> Severity | None:
    """Missing required skills matter most; anything shown in your experience is no gap."""
    return _SEVERITY.get((tier, status))


def match(resume: ResumeContent, job: JobAnalysis, today: date | None = None) -> MatchResult:
    today = today or date.today()
    index = _index(resume)
    years, undated = experience_years(resume, today)
    resume_words = _words(index.text)

    requirements = [
        _match_requirement(r, resume, index, years, undated, resume_words) for r in job.requirements
    ]

    gaps: list[SkillGap] = []
    for js in job.skills:
        status, refs = _skill_status(index, js.name)
        severity = _severity(js.tier, status)
        naming = [
            m for m, r in zip(requirements, job.requirements, strict=True) if js.name in r.skills
        ]
        covered = status != "strong" and bool(naming) and all(m.status == "strong" for m in naming)
        if covered:
            severity = "low"
        gaps.append(
            SkillGap(
                skill=js.name,
                tier=js.tier,
                status=status,
                severity=severity,
                covered_by_alternative=covered,
                evidence=refs[:3],
            )
        )

    subscores: list[Subscore] = []

    # Skills: tier-weighted credit over the job's skills.
    if gaps:
        total = sum(TIER_WEIGHT[g.tier] for g in gaps)
        got = sum(TIER_WEIGHT[g.tier] * STATUS_CREDIT[g.status] for g in gaps)
        strong = sum(1 for g in gaps if g.status == "strong")
        partial = sum(1 for g in gaps if g.status == "partial")
        subscores.append(
            Subscore(
                key="skills",
                label="Skills",
                score=round(100 * got / total),
                weight=WEIGHTS["skills"],
                explanation=f"{strong} of {len(gaps)} skills shown in your experience or projects, "
                f"{partial} only listed. Required skills count 3×, preferred 2×.",
            )
        )
    else:
        subscores.append(
            Subscore(
                key="skills",
                label="Skills",
                score=None,
                weight=WEIGHTS["skills"],
                explanation="The posting names no skills from the vocabulary.",
            )
        )

    exp_reqs = [
        r
        for r in requirements
        if r.category == "experience"
        and next((q.years for q in job.requirements if q.id == r.requirement_id), None) is not None
    ]
    if exp_reqs:
        credit = min(STATUS_CREDIT[r.status] for r in exp_reqs)
        subscores.append(
            Subscore(
                key="experience",
                label="Experience",
                score=round(100 * credit),
                weight=WEIGHTS["experience"],
                explanation=exp_reqs[0].reason,
            )
        )
    else:
        subscores.append(
            Subscore(
                key="experience",
                label="Experience",
                score=None,
                weight=WEIGHTS["experience"],
                explanation="The posting states no years of experience.",
            )
        )

    lowered = index.text.lower()
    matched_kw = [k for k in job.keywords if re.search(rf"(?<![a-z]){re.escape(k)}", lowered)]
    missing_kw = [k for k in job.keywords if k not in matched_kw]
    if job.keywords:
        subscores.append(
            Subscore(
                key="keywords",
                label="Keywords",
                score=round(100 * len(matched_kw) / len(job.keywords)),
                weight=WEIGHTS["keywords"],
                explanation=(
                    f"{len(matched_kw)} of {len(job.keywords)} frequent terms in the posting "
                    "appear in your resume."
                ),
            )
        )
    else:
        subscores.append(
            Subscore(
                key="keywords",
                label="Keywords",
                score=None,
                weight=WEIGHTS["keywords"],
                explanation="The posting has no repeated terms to compare.",
            )
        )

    edu_reqs = [r for r in requirements if r.category == "education"]
    if edu_reqs:
        credit = max(STATUS_CREDIT[r.status] for r in edu_reqs)
        subscores.append(
            Subscore(
                key="education",
                label="Education",
                score=round(100 * credit),
                weight=WEIGHTS["education"],
                explanation=edu_reqs[0].reason,
            )
        )
    else:
        subscores.append(
            Subscore(
                key="education",
                label="Education",
                score=None,
                weight=WEIGHTS["education"],
                explanation="The posting states no education requirement.",
            )
        )

    ats_score, _ = analyze_resume(resume)
    subscores.append(
        Subscore(
            key="ats",
            label="Resume quality",
            score=ats_score,
            weight=WEIGHTS["ats"],
            explanation="Your resume's conventions score from Resume Analysis.",
        )
    )

    applicable = [s for s in subscores if s.score is not None]
    weight = sum(s.weight for s in applicable)
    overall = round(sum((s.score or 0) * s.weight for s in applicable) / weight) if weight else 0

    return MatchResult(
        overall=overall,
        subscores=subscores,
        requirements=requirements,
        skills=gaps,
        resume_years=years,
        keywords_matched=matched_kw,
        keywords_missing=missing_kw,
    )
