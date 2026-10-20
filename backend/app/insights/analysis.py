"""Insights computed from data the user already has. Pure functions; no I/O, no AI.

Callback attribution (`outcomes-v1`)
    Which resume version and which match-score band each sent application went out with,
    and how far it got. "Got a response" means it ever reached screening or later; status
    history counts, so an application that was interviewed and then rejected still counts
    as an interview. Groups under MIN_SAMPLE applications are marked too small to compare:
    a rate over three applications is noise, and we say so instead of ranking it.

Personal market map (`market-v1`)
    Skill demand across all the user's saved job analyses, weighted by tier (required 3,
    preferred 2, nice to have 1), checked against the master resume with the same evidence
    rules as matching (used in experience/projects = strong, only listed = partial).
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime
from statistics import median

from app.jobs.analyzer import JobAnalysis
from app.matching.matcher import Status, _index, _skill_status
from app.resumes.content import ResumeContent

OUTCOMES_VERSION = "outcomes-v1"
MARKET_VERSION = "market-v1"
MIN_SAMPLE = 5

# Pipeline stages in order; rejected/withdrawn end a pipeline but are not a stage reached.
_STAGE = {"applied": 1, "screening": 2, "interviewing": 3, "offer": 4, "accepted": 5}
_TIER_WEIGHT = {"required": 3, "preferred": 2, "nice_to_have": 1}


# ---- callback attribution ---------------------------------------------------------------
@dataclass
class SentApplication:
    """One application as the attribution needs it."""

    status: str
    statuses_seen: Sequence[str]  # every to_status in its history
    resume_label: str | None  # "Title · v3", or None when no resume was recorded
    match_score: int | None  # latest match for the linked job, if any
    sent_on: date | None  # applied_on, else the creation date
    first_response_on: date | None  # first move to screening or later


@dataclass
class Funnel:
    sent: int = 0
    responded: int = 0
    interviewed: int = 0
    offers: int = 0

    def add(self, stage: int) -> None:
        self.sent += 1
        self.responded += stage >= _STAGE["screening"]
        self.interviewed += stage >= _STAGE["interviewing"]
        self.offers += stage >= _STAGE["offer"]

    def rate(self, part: int) -> float | None:
        return round(part / self.sent, 3) if self.sent else None


@dataclass
class Group:
    label: str
    funnel: Funnel = field(default_factory=Funnel)

    @property
    def enough(self) -> bool:
        return self.funnel.sent >= MIN_SAMPLE


@dataclass
class Outcomes:
    total: Funnel
    by_resume: list[Group]
    by_match: list[Group]
    median_days_to_response: float | None
    unsent: int  # still "saved": not part of any rate


def stage_reached(status: str, statuses_seen: Iterable[str]) -> int:
    return max((_STAGE.get(s, 0) for s in (status, *statuses_seen)), default=0)


def score_band(score: int | None) -> str:
    if score is None:
        return "No match run"
    if score >= 75:
        return "75-100"
    if score >= 50:
        return "50-74"
    return "0-49"


_BAND_ORDER = ["75-100", "50-74", "0-49", "No match run"]


def attribute_outcomes(apps: Sequence[SentApplication]) -> Outcomes:
    total = Funnel()
    resumes: dict[str, Group] = {}
    bands: dict[str, Group] = {}
    waits: list[int] = []
    unsent = 0
    for app in apps:
        stage = stage_reached(app.status, app.statuses_seen)
        if stage == 0:
            unsent += 1
            continue
        total.add(stage)
        label = app.resume_label or "Resume not recorded"
        resumes.setdefault(label, Group(label)).funnel.add(stage)
        band = score_band(app.match_score)
        bands.setdefault(band, Group(band)).funnel.add(stage)
        if app.sent_on and app.first_response_on and app.first_response_on >= app.sent_on:
            waits.append((app.first_response_on - app.sent_on).days)

    # Comparable groups first, best response rate first; small groups after, by size.
    by_resume = sorted(
        resumes.values(),
        key=lambda g: (not g.enough, -(g.funnel.rate(g.funnel.responded) or 0), -g.funnel.sent),
    )
    by_match = sorted(bands.values(), key=lambda g: _BAND_ORDER.index(g.label))
    return Outcomes(
        total=total,
        by_resume=by_resume,
        by_match=by_match,
        median_days_to_response=float(median(waits)) if waits else None,
        unsent=unsent,
    )


def first_response(events: Iterable[tuple[str | None, datetime]]) -> date | None:
    """Date of the first move to screening or later, from (to_status, created_at) pairs."""
    hits = [at.date() for to, at in events if to and _STAGE.get(to, 0) >= _STAGE["screening"]]
    return min(hits) if hits else None


# ---- personal market map ----------------------------------------------------------------
@dataclass
class SkillDemand:
    name: str
    category: str
    jobs: int = 0
    required_in: int = 0
    weight: int = 0
    status: Status | None = None  # None when there is no master resume
    evidence: str | None = None  # where the master shows it, for strong/partial
    job_titles: list[str] = field(default_factory=list)


@dataclass
class MarketMap:
    jobs_analyzed: int
    skills: list[SkillDemand]
    coverage: float | None  # weighted share of demand the master backs (partial = half)
    top_gap: SkillDemand | None


def market_map(
    jobs: Sequence[tuple[str, JobAnalysis]], master: ResumeContent | None, limit: int = 40
) -> MarketMap:
    demand: dict[str, SkillDemand] = {}
    for title, analysis in jobs:
        for skill in analysis.skills:
            d = demand.setdefault(skill.name, SkillDemand(skill.name, skill.category))
            d.jobs += 1
            d.required_in += skill.tier == "required"
            d.weight += _TIER_WEIGHT.get(skill.tier, 1)
            if title not in d.job_titles:
                d.job_titles.append(title)

    skills = sorted(demand.values(), key=lambda d: (-d.weight, -d.jobs, d.name.lower()))[:limit]
    coverage: float | None = None
    top_gap: SkillDemand | None = None
    if master is not None:
        index = _index(master)
        for d in skills:
            status, refs = _skill_status(index, d.name)
            d.status = status
            d.evidence = refs[0].label if refs else None
        total = sum(d.weight for d in skills)
        backed = sum(
            d.weight * {"strong": 1.0, "partial": 0.5}.get(d.status or "", 0) for d in skills
        )
        coverage = round(backed / total, 3) if total else None
        # The single gap worth most: heaviest missing skill, else heaviest listed-only one.
        top_gap = next((d for d in skills if d.status == "missing"), None) or next(
            (d for d in skills if d.status == "partial"), None
        )
    return MarketMap(jobs_analyzed=len(jobs), skills=skills, coverage=coverage, top_gap=top_gap)
