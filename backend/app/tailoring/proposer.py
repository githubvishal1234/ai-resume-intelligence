"""Deterministic tailoring proposals (`tailor-rules-v1`). No LLM is involved.

Every proposal only reorders or re-surfaces what the master resume already contains:
- skills that the job asks for move to the top of the skills list,
- bullets and projects that mention the job's skills move up,
- skills shown in experience or projects but missing from the skills list are added to it,
- the summary gains one sentence naming job skills the experience already shows.
Strong focus (`focus`, on request) goes further, still only with the master's own content:
- a headline under the name from the latest title and the job skills the resume shows,
- projects before experience when a project fits the job better than any role,
- bullets and projects that share nothing with the job are left out of the copy.
Each proposal carries the reason, the requirements it serves and its evidence.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from app.jobs.analyzer import JobAnalysis
from app.matching.matcher import TIER_WEIGHT, EvidenceRef, MatchResult
from app.resumes.content import ResumeContent, Skill, new_id
from app.skills.vocabulary import canonical, find_skills

METHOD_VERSION = "tailor-rules-v1"
ChangeKind = Literal[
    "reorder_skills",
    "reorder_bullets",
    "reorder_projects",
    "add_skills",
    "summary",
    "rewrite_bullet",  # created on request by the LLM rewrite, never by these rules
    "headline",
    "reorder_sections",
    "trim_bullets",
    "trim_projects",
    "trim_skills",
    "add_bullet",  # what the user told us they did with a skill, under that role or project
    "confirm_skill",  # a skill the user says they have, with where they used it
]
EDITABLE_KINDS: frozenset[str] = frozenset({"summary", "rewrite_bullet", "headline", "add_bullet"})
FOCUS_KINDS: frozenset[str] = frozenset(
    {"headline", "reorder_sections", "trim_bullets", "trim_projects", "trim_skills"}
)
# Strong focus never leaves a role with fewer bullets than this.
KEEP_BULLETS = 3
# Strong focus keeps the job's skills and, when there are fewer, tops up to this many.
SKILLS_KEPT = 12
# Kinds whose text is new wording, so it goes through the factual check.
TEXT_KINDS: frozenset[str] = EDITABLE_KINDS


class Proposal(BaseModel):
    kind: ChangeKind
    target_id: str | None = None
    title: str
    original: dict[str, Any]
    proposed: dict[str, Any]
    reason: str
    requirement_ids: list[str] = Field(default_factory=list)
    evidence: list[EvidenceRef] = Field(default_factory=list)


class ChangeNotApplicable(Exception):
    """The proposal no longer fits the content it is applied to."""


def _weights(job: JobAnalysis) -> dict[str, int]:
    return {s.name: TIER_WEIGHT[s.tier] for s in job.skills}


def _relevance(text: str, weights: dict[str, int], keywords: list[str]) -> int:
    lowered = text.lower()
    score = sum(weights.get(s, 0) * 10 for s in find_skills(text))
    return score + sum(1 for k in keywords if k in lowered)


def requirements_for(job: JobAnalysis, skills: set[str]) -> list[str]:
    return [r.id for r in job.requirements if skills & set(r.skills)]


def _join(names: list[str]) -> str:
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]


def propose(master: ResumeContent, job: JobAnalysis, result: MatchResult) -> list[Proposal]:
    weights = _weights(job)
    out: list[Proposal] = []

    # 1. Skills list: job skills first (by tier). Skill groups stay together; the group
    #    with the most relevant skill comes first, and everything else keeps its order.
    def weight_of(skill: Skill) -> int:
        return weights.get(canonical(skill.name) or "", 0)

    groups: list[str] = []
    for skill in master.skills:
        if skill.category not in groups:
            groups.append(skill.category)
    best = {g: max(weight_of(s) for s in master.skills if s.category == g) for g in groups}
    group_rank = {
        g: i for i, g in enumerate(sorted(groups, key=lambda g: (-best[g], groups.index(g))))
    }

    def skill_key(item: tuple[int, Skill]) -> tuple[int, int, int]:
        return (group_rank[item[1].category], -weight_of(item[1]), item[0])

    ordered = [s for _, s in sorted(enumerate(master.skills), key=skill_key)]
    if [s.id for s in ordered] != [s.id for s in master.skills]:
        moved = [
            canonical(s.name) or s.name for s in ordered if weights.get(canonical(s.name) or "")
        ]
        out.append(
            Proposal(
                kind="reorder_skills",
                title="Put the job's skills first in your skills list",
                original={"items": [{"id": s.id, "text": s.name} for s in master.skills]},
                proposed={"items": [{"id": s.id, "text": s.name} for s in ordered]},
                reason=(
                    f"The posting asks for {_join(moved[:5])}; "
                    "readers and screeners look at the top first."
                ),
                requirement_ids=requirements_for(job, set(moved)),
            )
        )

    # 2. Bullets inside each role: the most relevant first.
    for exp in master.experience:
        if len(exp.bullets) < 2:
            continue
        ranked = sorted(
            enumerate(exp.bullets), key=lambda b: (-_relevance(b[1], weights, job.keywords), b[0])
        )
        bullets = [b for _, b in ranked]
        if bullets == exp.bullets:
            continue
        top = bullets[0]
        skills = sorted(set(find_skills(top)) & set(weights))
        label = " at ".join(p for p in (exp.title, exp.company) if p) or "Experience"
        out.append(
            Proposal(
                kind="reorder_bullets",
                target_id=exp.id,
                title="Lead with your most relevant work at "
                + (exp.company or exp.title or "this role"),
                original={"items": [{"id": None, "text": b} for b in exp.bullets]},
                proposed={"items": [{"id": None, "text": b} for b in bullets]},
                reason=(
                    f"This bullet shows {_join(skills)}, which the posting asks for."
                    if skills
                    else "This bullet uses more of the posting's terms."
                ),
                requirement_ids=requirements_for(job, set(skills)),
                evidence=[
                    EvidenceRef(kind="experience", entity_id=exp.id, label=label, excerpt=top[:160])
                ],
            )
        )

    # 3. Projects: the most relevant first.
    if len(master.projects) > 1:

        def project_text(i: int) -> str:
            p = master.projects[i]
            return " ".join([p.name, p.description, *p.technologies, *p.bullets])

        order = sorted(
            range(len(master.projects)),
            key=lambda i: (-_relevance(project_text(i), weights, job.keywords), i),
        )
        if order != list(range(len(master.projects))):
            projects = [master.projects[i] for i in order]
            skills = sorted(set(find_skills(project_text(order[0]))) & set(weights))
            out.append(
                Proposal(
                    kind="reorder_projects",
                    title="Show your most relevant project first",
                    original={"items": [{"id": p.id, "text": p.name} for p in master.projects]},
                    proposed={"items": [{"id": p.id, "text": p.name} for p in projects]},
                    reason=(
                        f"“{projects[0].name}” uses {_join(skills)}."
                        if skills
                        else f"“{projects[0].name}” matches more of the posting's terms."
                    ),
                    requirement_ids=requirements_for(job, set(skills)),
                )
            )

    # 4. Skills the experience shows but the skills list leaves out.
    listed = {canonical(s.name) or s.name for s in master.skills}
    shown = [g for g in result.skills if g.status == "strong" and g.skill not in listed]
    if shown:
        names = [g.skill for g in shown]
        out.append(
            Proposal(
                kind="add_skills",
                title="Add skills your experience already shows",
                original={"items": [{"id": s.id, "text": s.name} for s in master.skills]},
                # Ids are fixed now so every preview and the final resume agree.
                proposed={"items": [{"id": new_id(), "text": n} for n in names]},
                reason=(
                    f"Your experience shows {_join(names)}, "
                    "but your skills list does not name them."
                ),
                requirement_ids=requirements_for(job, set(names)),
                evidence=[e for g in shown for e in g.evidence[:1]],
            )
        )

    # 5. Summary: one sentence naming job skills your roles and projects already show.
    in_summary = set(find_skills(master.summary))
    strong = [
        g
        for g in sorted(result.skills, key=lambda g: -TIER_WEIGHT[g.tier])
        if g.status == "strong" and g.skill not in in_summary
    ][:4]
    if strong and master.summary:
        names = [g.skill for g in strong]
        sentence = f"Hands-on experience with {_join(names)}."
        text = master.summary.rstrip()
        text = (text if text.endswith((".", "!", "?")) else text + ".") + " " + sentence
        out.append(
            Proposal(
                kind="summary",
                title="Name the job's key skills in your summary",
                original={"text": master.summary},
                proposed={"text": text},
                reason=(
                    f"Your roles or projects show {_join(names)}; "
                    "your summary does not mention them yet."
                ),
                requirement_ids=requirements_for(job, set(names)),
                evidence=[e for g in strong for e in g.evidence[:1]],
            )
        )
    return out


def focus(master: ResumeContent, job: JobAnalysis, result: MatchResult) -> list[Proposal]:
    """The strong-focus proposals: they reshape the copy around the job, inventing nothing."""
    weights = _weights(job)
    out: list[Proposal] = []

    def score(text: str) -> int:
        return _relevance(text, weights, job.keywords)

    # 1. Headline: the latest title and up to three job skills the resume shows.
    title = next((e.title for e in master.experience if e.title), "")
    shown = [
        g.skill
        for g in sorted(result.skills, key=lambda g: -TIER_WEIGHT[g.tier])
        if g.status == "strong"
    ][:3]
    headline = " | ".join(p for p in (title, ", ".join(shown)) if p)
    if headline and headline != master.contact.headline:
        out.append(
            Proposal(
                kind="headline",
                title="Add a headline aimed at this job",
                original={"text": master.contact.headline},
                proposed={"text": headline},
                reason="A line under your name tells the reader at once what you bring.",
                requirement_ids=requirements_for(job, set(shown)),
            )
        )

    # 2. Projects first when one fits the job better than any role does.
    def project_text(p: Any) -> str:
        return " ".join([p.name, p.description, *p.technologies, *p.bullets])

    best_role = max((score(b) for e in master.experience for b in e.bullets), default=0)
    best_project = max(master.projects, key=lambda p: score(project_text(p)), default=None)
    if master.experience and best_project and score(project_text(best_project)) > best_role:
        out.append(
            Proposal(
                kind="reorder_sections",
                title="Show your projects before your experience",
                original={"items": [{"id": "experience", "text": "Experience"}]},
                proposed={
                    "items": [
                        {"id": "projects", "text": "Projects"},
                        {"id": "experience", "text": "Experience"},
                    ]
                },
                reason=(
                    f"“{best_project.name}” matches this job better than your work experience, "
                    "so readers should see it first."
                ),
            )
        )

    # 3. Bullets that share nothing with the job; every role keeps at least three.
    for exp in master.experience:
        if len(exp.bullets) <= KEEP_BULLETS:
            continue
        top = sorted(range(len(exp.bullets)), key=lambda i: (-score(exp.bullets[i]), i))[
            :KEEP_BULLETS
        ]
        keep = [b for i, b in enumerate(exp.bullets) if score(b) > 0 or i in top]
        if len(keep) == len(exp.bullets):
            continue
        out.append(
            Proposal(
                kind="trim_bullets",
                target_id=exp.id,
                title="Leave out unrelated bullets at " + (exp.company or exp.title or "this role"),
                original={"items": [{"id": None, "text": b} for b in exp.bullets]},
                proposed={"items": [{"id": None, "text": b} for b in keep]},
                reason="These bullets share no skill or term with the posting; a shorter, "
                "focused role reads stronger. They stay in your master resume.",
            )
        )

    # 4. Projects that share nothing with the job; at least one stays.
    if len(master.projects) > 1:
        ranked = sorted(master.projects, key=lambda p: -score(project_text(p)))
        kept = [p for p in master.projects if score(project_text(p)) > 0 or p is ranked[0]]
        if len(kept) < len(master.projects):
            out.append(
                Proposal(
                    kind="trim_projects",
                    title="Leave out unrelated projects",
                    original={"items": [{"id": p.id, "text": p.name} for p in master.projects]},
                    proposed={"items": [{"id": p.id, "text": p.name} for p in kept]},
                    reason="These projects share no skill or term with the posting. "
                    "They stay in your master resume.",
                )
            )

    # 5. Skills the job doesn't ask for; a long list of them hides the ones it does.
    if len(master.skills) > SKILLS_KEPT:
        wanted = [s for s in master.skills if weights.get(canonical(s.name) or "")]
        # Top up with neighbours of the job's skills (same group) before anything else.
        groups = {s.category for s in wanted}
        others = sorted(
            (s for s in master.skills if s not in wanted), key=lambda s: s.category not in groups
        )
        keep_ids = {s.id for s in wanted + others[: max(0, SKILLS_KEPT - len(wanted))]}
        kept_skills = [s for s in master.skills if s.id in keep_ids]
        if len(kept_skills) < len(master.skills):
            out.append(
                Proposal(
                    kind="trim_skills",
                    title="Leave out skills this job doesn't ask for",
                    original={"items": [{"id": s.id, "text": s.name} for s in master.skills]},
                    proposed={"items": [{"id": s.id, "text": s.name} for s in kept_skills]},
                    reason="A shorter list shows the skills this job asks for first. "
                    "The rest stay in your master resume.",
                    requirement_ids=requirements_for(
                        job, {canonical(s.name) or s.name for s in wanted}
                    ),
                )
            )
    return out


def _texts(items: list[dict[str, Any]]) -> list[str]:
    return [str(i["text"]) for i in items]


def apply(content: ResumeContent, change: Proposal, value: dict[str, Any]) -> ResumeContent:
    """Applies one accepted change (with the user's edited value, if any) to a copy of content."""
    doc = content.model_copy(deep=True)
    if change.kind == "reorder_skills":
        by_id = {s.id: s for s in doc.skills}
        ids = [i["id"] for i in value["items"]]
        if sorted(ids) != sorted(by_id):
            raise ChangeNotApplicable()
        doc.skills = [by_id[i] for i in ids]
    elif change.kind == "reorder_projects":
        projects = {p.id: p for p in doc.projects}
        order = [i["id"] for i in value["items"]]
        if sorted(order) != sorted(projects):
            raise ChangeNotApplicable()
        doc.projects = [projects[i] for i in order]
    elif change.kind == "reorder_bullets":
        exp = next((e for e in doc.experience if e.id == change.target_id), None)
        new = _texts(value["items"])
        if exp is None or sorted(new) != sorted(exp.bullets):
            raise ChangeNotApplicable()
        exp.bullets = new
    elif change.kind == "trim_bullets":
        exp = next((e for e in doc.experience if e.id == change.target_id), None)
        keep = _texts(value["items"])
        if exp is None or not set(keep) <= set(exp.bullets):
            raise ChangeNotApplicable()
        exp.bullets = [b for b in exp.bullets if b in keep]
    elif change.kind == "trim_skills":
        # Only the skills this change leaves out go, so skills added by other changes stay.
        drop = {i["id"] for i in change.original["items"]} - {i["id"] for i in value["items"]}
        doc.skills = [s for s in doc.skills if s.id not in drop]
    elif change.kind == "trim_projects":
        keep_ids = {i["id"] for i in value["items"]}
        if not keep_ids <= {p.id for p in doc.projects}:
            raise ChangeNotApplicable()
        doc.projects = [p for p in doc.projects if p.id in keep_ids]
    elif change.kind == "reorder_sections":
        doc.section_order = [i["id"] for i in value["items"]]
    elif change.kind == "headline":
        doc.contact.headline = str(value["text"]).strip()
    elif change.kind in ("add_skills", "confirm_skill"):
        have = {(canonical(s.name) or s.name).lower() for s in doc.skills}
        for item in value["items"]:
            name = str(item["text"])
            if name.lower() not in have:
                doc.skills.append(Skill(id=item.get("id") or new_id(), name=name, category=""))
    elif change.kind == "summary":
        doc.summary = str(value["text"]).strip()
    elif change.kind == "rewrite_bullet":
        # Matched by text, so it still applies after the role's bullets were reordered.
        exp = next((e for e in doc.experience if e.id == change.target_id), None)
        old = str(change.original["text"])
        if exp is None or old not in exp.bullets:
            raise ChangeNotApplicable()
        exp.bullets[exp.bullets.index(old)] = str(value["text"]).strip()
    elif change.kind == "add_bullet":
        text = str(value["text"]).strip()
        exp = next((e for e in doc.experience if e.id == change.target_id), None)
        project = next((p for p in doc.projects if p.id == change.target_id), None)
        target = exp.bullets if exp else project.bullets if project else None
        if target is None or not text:
            raise ChangeNotApplicable()
        if text not in target:
            target.append(text)
    return doc


def apply_order(kind: str) -> int:
    """Rewrites and added bullets go last, so reorders and trims see the master's own text."""
    return 1 if kind in ("rewrite_bullet", "add_bullet") else 0
