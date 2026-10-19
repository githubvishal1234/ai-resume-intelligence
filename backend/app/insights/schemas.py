from __future__ import annotations

from pydantic import BaseModel

from app.matching.matcher import Status


class FunnelOut(BaseModel):
    sent: int
    responded: int
    interviewed: int
    offers: int
    response_rate: float | None
    interview_rate: float | None


class GroupOut(BaseModel):
    label: str
    funnel: FunnelOut
    enough_data: bool


class OutcomesOut(BaseModel):
    method_version: str
    min_sample: int
    total: FunnelOut
    by_resume: list[GroupOut]
    by_match: list[GroupOut]
    median_days_to_response: float | None
    unsent: int


class SkillDemandOut(BaseModel):
    name: str
    category: str
    jobs: int
    required_in: int
    weight: int
    status: Status | None
    evidence: str | None
    job_titles: list[str]


class MarketOut(BaseModel):
    method_version: str
    jobs_analyzed: int
    has_master: bool
    coverage: float | None
    top_gap: SkillDemandOut | None
    skills: list[SkillDemandOut]
