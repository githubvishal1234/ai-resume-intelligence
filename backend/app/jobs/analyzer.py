"""Deterministic job-description analysis: requirements, tiers, skills and job facts.

Like the resume parser, it only copies or classifies text that is present. Facts such as
salary or years of experience appear only when the posting states them.
"""

from __future__ import annotations

import hashlib
import re
from collections import Counter
from typing import Literal

from pydantic import BaseModel, Field

from app.skills.vocabulary import category_of, find_skills

ANALYZER_VERSION = "jd-rules-v1"
Tier = Literal["required", "preferred", "nice_to_have"]
ReqCategory = Literal[
    "skill", "experience", "education", "certification", "responsibility", "other"
]
SectionKind = Literal[
    "requirements", "preferred", "nice", "responsibilities", "about", "benefits", "other"
]


class Requirement(BaseModel):
    id: str
    text: str
    tier: Tier
    category: ReqCategory
    skills: list[str] = Field(default_factory=list)
    years: int | None = None


class JobSkill(BaseModel):
    name: str
    category: str
    tier: Tier
    mentions: int


class JobAnalysis(BaseModel):
    analyzer_version: str = ANALYZER_VERSION
    requirements: list[Requirement] = Field(default_factory=list)
    responsibilities: list[str] = Field(default_factory=list)
    skills: list[JobSkill] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    years_experience_min: int | None = None
    education_level: str | None = None
    seniority: str | None = None
    employment_type: str | None = None
    work_mode: str | None = None
    salary: str | None = None
    sections_found: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    # Set when the requirements came from the AI (`jd-ai-v1`, see ai_analyzer.py).
    ai_provider: str | None = None
    ai_model: str | None = None
    ai_dropped: list[str] = Field(default_factory=list)


_SECTION_HEADINGS: list[tuple[re.Pattern[str], SectionKind]] = [
    # Job-board trailers (Naukri, LinkedIn): a skills tag cloud, the education block and the
    # aggregator's disclaimer. None of them are requirements, so they are skipped like "about".
    (re.compile(r"^(?:key skills|skills highlighted|education|disclaimer)\b.*", re.I), "about"),
    (
        re.compile(
            r".*\b(?:nice[- ]to[- ]haves?|bonus points|pluses|is a plus|would be a plus)\b.*|"
            r"^bonus\b.*",
            re.I,
        ),
        "nice",
    ),
    (re.compile(r"^(?:preferred|desired|additional|good[- ]to[- ]have)\b.*", re.I), "preferred"),
    (re.compile(r"^domain (?:experience|knowledge|expertise)$", re.I), "preferred"),
    # "Work Experience", "Experience Required", "Skills & Experience" (LinkedIn, Naukri).
    (
        re.compile(
            r"^(?:(?:work|required|relevant|professional) )?experience"
            r"(?: required| needed|(?: and| &) skills)?$",
            re.I,
        ),
        "requirements",
    ),
    (
        re.compile(
            r".*\b(?:requirements?|qualifications?|must[- ]haves?|what you(?:'ll)? (?:need|"
            r"bring)|who you are|what we(?:'re)? looking for|skills(?: and| &)? experience|"
            r"you have|about you|your profile|minimum qualifications|basic qualifications)\b.*",
            re.I,
        ),
        "requirements",
    ),
    (
        re.compile(
            r".*\b(?:responsibilities|what you(?:'ll)? do|the role|your role|your impact|"
            r"day[- ]to[- ]day|duties|key accountabilities|you will)\b.*",
            re.I,
        ),
        "responsibilities",
    ),
    (
        re.compile(
            r".*\b(?:benefits|perks|what we offer|compensation|why join|we offer)\b.*", re.I
        ),
        "benefits",
    ),
    (
        re.compile(
            r"^(?:about (?:us|the company|the team)|who we are|our mission|company)\b.*", re.I
        ),
        "about",
    ),
]
# "Label: value" metadata rows that job boards append ("Role: ...", "UG: Any Graduate").
_META_LINE = re.compile(
    r"^(?:disclaimer|role|industry(?: type)?|department|employment type|role category|"
    r"functional area|ug|pg|doctorate|job type|work mode|openings|applicants|posted)\s*:",
    re.I,
)
# Lead-ins such as "Below are the required set of proficiencies which we are looking for".
_INTRO_LINE = re.compile(r"^(?:below|following) (?:are|is)\b|\blooking for\s*:?$", re.I)
_BULLET = re.compile(r"^\s*(?:[•\-\*▪●◦‣·■➢➤►✓✔]|\d{1,2}[.)])\s+")
_YEARS = re.compile(r"(\d{1,2})\s*\+?\s*(?:-|–|to)?\s*(?:\d{1,2})?\s*\+?\s*(?:years?|yrs?)\b", re.I)
_PREFERRED_CUES = re.compile(
    r"\b(?:preferred|nice to have|nice-to-have|a plus|is a plus|(?:a )?strong plus|bonus|"
    r"ideally|desirable|advantage|beneficial)\b",
    re.I,
)
_REQUIRED_CUES = re.compile(
    r"\b(?:required|must|minimum|mandatory|need to|you have|"
    r"strong|proven|solid|proficien\w*|experience (?:with|in)|"
    r"knowledge of|familiarity with|understanding of)\b",
    re.I,
)
_EDU = re.compile(
    r"\b(ph\.?d|doctorate|master'?s?|m\.?s\.?|mba|bachelor'?s?|b\.?s\.?|b\.?tech|"
    r"b\.?e\.?|degree)\b",
    re.I,
)
_CERT = re.compile(r"\b(certif\w+|licensed?|license)\b", re.I)
_SALARY = re.compile(
    r"(?:[$€£₹]\s?\d[\d,.]*\s?(?:k|K|lpa|LPA|lakhs?)?(?:\s?(?:-|–|to)\s?[$€£₹]?\s?\d[\d,.]*\s?"
    r"(?:k|K|lpa|LPA|lakhs?)?)?(?:\s?(?:per|/)\s?(?:year|yr|annum|hour|hr|month))?|"
    r"\d[\d,.]*\s?(?:-|–|to)\s?\d[\d,.]*\s?(?:LPA|lpa|lakhs? per annum|USD|EUR|GBP|INR))"
)
_SENIORITY = [
    ("Intern", re.compile(r"\bintern(ship)?\b", re.I)),
    ("Principal", re.compile(r"\bprincipal\b", re.I)),
    ("Staff", re.compile(r"\bstaff\b", re.I)),
    ("Lead", re.compile(r"\b(lead|head of)\b", re.I)),
    ("Manager", re.compile(r"\bmanager\b", re.I)),
    ("Senior", re.compile(r"\b(senior|sr\.?)\b", re.I)),
    ("Junior", re.compile(r"\b(junior|jr\.?|entry[- ]level|graduate)\b", re.I)),
    ("Mid-level", re.compile(r"\b(mid[- ]level|intermediate)\b", re.I)),
]
_EMPLOYMENT = [
    ("Internship", re.compile(r"\binternship\b", re.I)),
    ("Contract", re.compile(r"\b(contract|contractor|freelance|temporary)\b", re.I)),
    ("Part-time", re.compile(r"\bpart[- ]time\b", re.I)),
    ("Full-time", re.compile(r"\bfull[- ]time\b|\bpermanent\b", re.I)),
]
_WORK_MODE = [
    ("Hybrid", re.compile(r"\bhybrid\b", re.I)),
    ("Remote", re.compile(r"\b(remote|work from home|wfh|distributed team)\b", re.I)),
    ("On-site", re.compile(r"\b(on[- ]site|onsite|in[- ]office)\b", re.I)),
]
_STOP_WORDS = """a about above after again all also an and any are as at be because been
before being below between both but by can could did do does doing down during each etc every
few for from further get had has have having help here how i if in into is it its just like
make more most must my no nor not now of off on once only or other our out over own per same
should so some such than that the their them then there these they this those through to too
under until up very was we well were what when where which while who whom why will with within
would you your yours team teams work working role job company including across strong ability
able years year experience new using use etc. e.g. i.e. based skills highly great good plus
looking join opportunity candidate candidates ideal required preferred responsibilities
requirements qualifications"""
_STOP = frozenset(_STOP_WORDS.split())


def _heading_kind(line: str) -> SectionKind | None:
    stripped = line.strip().rstrip(":").strip()
    if not stripped or len(stripped) > 70 or _BULLET.match(line) or len(stripped.split()) > 9:
        return None
    if stripped.endswith(".") and not stripped.endswith("etc."):
        return None
    for pattern, kind in _SECTION_HEADINGS:
        if pattern.fullmatch(stripped):
            return kind
    return None


def _sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?;])\s+(?=[A-Z])", text)
    return [p.strip() for p in parts if len(p.strip()) > 3]


def _category(text: str, skills: list[str]) -> ReqCategory:
    if _EDU.search(text) and re.search(
        r"\b(degree|bachelor|master|ph\.?d|diploma|b\.?tech|"
        r"field)\b",
        text,
        re.I,
    ):
        return "education"
    if _CERT.search(text):
        return "certification"
    if _YEARS.search(text):
        return "experience"
    if skills:
        return "skill"
    return "other"


def _years(text: str) -> int | None:
    match = _YEARS.search(text)
    return int(match.group(1)) if match else None


def _first(patterns: list[tuple[str, re.Pattern[str]]], text: str) -> str | None:
    for label, pattern in patterns:
        if pattern.search(text):
            return label
    return None


def _education_level(text: str) -> str | None:
    lowered = text.lower()
    if re.search(r"\bph\.?d|doctorate\b", lowered):
        return "Doctorate"
    if re.search(r"\b(master'?s?|m\.s\.|msc|mba)\b", lowered):
        return "Master's"
    if re.search(
        r"\b(bachelor'?s?|b\.s\.|bsc|b\.?tech|b\.e\.|undergraduate degree|"
        r"degree in)\b",
        lowered,
    ):
        return "Bachelor's"
    return None


def _keywords(text: str, exclude: set[str]) -> list[str]:
    words = re.findall(r"[A-Za-z][A-Za-z+#./-]{2,}", text)
    counts = Counter(
        w.lower().strip(".")
        for w in words
        if w.lower().strip(".") not in _STOP and w.lower() not in exclude
    )
    return [w for w, n in counts.most_common(40) if n >= 2][:20]


def analyze_job(text: str, title: str = "", company: str = "") -> JobAnalysis:
    lines = [ln.rstrip() for ln in text.replace("\r", "").split("\n")]
    analysis = JobAnalysis()
    current: SectionKind = "other"
    has_sections = False
    collected: list[tuple[SectionKind, str]] = []
    for raw in lines:
        if not raw.strip():
            continue
        kind = _heading_kind(raw)
        if kind:
            current = kind
            has_sections = True
            analysis.sections_found.append(raw.strip().rstrip(":"))
            continue
        item = _BULLET.sub("", raw, count=1).strip()
        if _BULLET.match(raw) or len(item) < 280:
            collected.append((current, item))
        else:
            collected.extend((current, s) for s in _sentences(item))

    seen: set[str] = set()
    for section, item in collected:
        key = item.lower()
        if key in seen or len(item) < 6:
            continue
        seen.add(key)
        skills = find_skills(item)
        if _META_LINE.match(item) or (not skills and _INTRO_LINE.search(item)):
            continue
        if section == "responsibilities":
            analysis.responsibilities.append(item[:600])
            continue
        if section in ("about", "benefits"):
            continue
        if section == "requirements":
            tier: Tier = "preferred" if _PREFERRED_CUES.search(item) else "required"
        elif section == "nice":
            tier = "nice_to_have"
        elif section == "preferred":
            tier = "preferred"
        else:
            # Outside labelled sections only clear requirement statements count.
            if _PREFERRED_CUES.search(item):
                tier = "preferred"
            elif (
                _REQUIRED_CUES.search(item)
                or _YEARS.search(item)
                or (skills and has_sections is False)
            ):
                tier = "required"
            else:
                continue
        analysis.requirements.append(make_requirement(item, tier))

    finish_analysis(analysis, text, title, company)
    if not has_sections:
        analysis.warnings.append(
            "No section headings (e.g. 'Requirements') were found, so "
            "requirements were identified sentence by sentence."
        )
    if not analysis.requirements:
        analysis.warnings.append(
            "No requirements were identified. Check that the full job description was pasted."
        )
    return analysis


def make_requirement(item: str, tier: Tier, category: ReqCategory | None = None) -> Requirement:
    skills = find_skills(item)
    return Requirement(
        # Stable across re-analysis of the same text, so matches can refer to it.
        id=hashlib.sha256(f"{tier}:{item.lower()}".encode()).hexdigest()[:12],
        text=item[:600],
        tier=tier,
        category=category or _category(item, skills),
        skills=skills,
        years=_years(item),
    )


def finish_analysis(analysis: JobAnalysis, text: str, title: str, company: str) -> None:
    """Fills skills, job facts and keywords from the requirements and the posting text."""
    lines = [ln.rstrip() for ln in text.replace("\r", "").split("\n")]
    # Skills: tier = strongest tier that mentions them; mentions over the whole posting.
    order = {"required": 0, "preferred": 1, "nice_to_have": 2}
    best: dict[str, Tier] = {}
    for req in analysis.requirements:
        for skill in req.skills:
            if skill not in best or order[req.tier] < order[best[skill]]:
                best[skill] = req.tier
    for skill in find_skills(" ".join(analysis.responsibilities)):
        best.setdefault(skill, "preferred")
    lowered = text.lower()
    for name, tier in best.items():
        mentions = max(1, len(re.findall(re.escape(name.lower()), lowered)))
        analysis.skills.append(
            JobSkill(name=name, category=category_of(name) or "other", tier=tier, mentions=mentions)
        )
    analysis.skills.sort(key=lambda s: (order[s.tier], -s.mentions, s.name))

    years = [r.years for r in analysis.requirements if r.years is not None and r.years <= 30]
    analysis.years_experience_min = min(years) if years else None
    analysis.education_level = (
        _education_level(
            " ".join(r.text for r in analysis.requirements if r.category == "education")
        )
        or None
    )
    head = f"{title}\n" + "\n".join(lines[:5])
    analysis.seniority = _first(_SENIORITY, title) or _first(_SENIORITY, head)
    analysis.employment_type = _first(_EMPLOYMENT, text)
    analysis.work_mode = _first(_WORK_MODE, text)
    salary = _SALARY.search(text)
    analysis.salary = salary.group(0).strip() if salary else None
    # The company's own name is repeated in every posting and says nothing about the role.
    exclude = {s.name.lower() for s in analysis.skills} | set(company.lower().split())
    analysis.keywords = _keywords(text, exclude)


def guess_title(text: str) -> str:
    """The first short line is usually the job title in a pasted posting."""
    for line in text.split("\n"):
        candidate = line.strip()
        if (
            candidate
            and len(candidate) <= 100
            and len(candidate.split()) <= 12
            and not _heading_kind(candidate)
        ):
            return candidate.rstrip(":")
    return "Untitled job"
