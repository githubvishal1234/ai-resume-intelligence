"""Proof-task suggestions (`proof-v1`): small, scoped work that creates real evidence.

Templates are chosen by the skill's category in the shared vocabulary. They never name a
specific certificate, course or vendor programme: we do not know which ones a given
employer respects, so the certification suggestion says how to choose one instead.
Every plan ends with the same step, because a finished project only counts as evidence
once it is in the master resume, with a result someone can check.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.skills.vocabulary import category_of

PROOF_VERSION = "proof-v1"

_LAST_STEP = (
    "Add it to your master resume (Projects or the matching role) with one concrete, "
    "checkable result, then re-run the match."
)


@dataclass(frozen=True)
class Suggestion:
    kind: str  # project | certification | writeup
    title: str
    plan: list[str]


def _project(title: str, *steps: str) -> Suggestion:
    return Suggestion("project", title, [*steps, _LAST_STEP])


def suggest(skill: str) -> list[Suggestion]:
    category = category_of(skill) or "other"
    s = skill
    if category == "language":
        main = _project(
            f"Build a small tool in {s}",
            "Pick a problem you already have (a script you run by hand, a report you rebuild).",
            f"Write it in idiomatic {s}, with a README and at least a few automated tests.",
            "Publish the repository and note one measurable effect (time saved, size, speed).",
        )
    elif category in {"framework", "library", "vue", "node", "dotnet"}:
        main = _project(
            f"Ship a small app with {s}",
            f"Scope one feature that uses {s} for its core job; keep it to a weekend or two.",
            "Deploy it or record a short demo, and write down a decision you made and why.",
            "Publish the code with setup steps someone else can follow.",
        )
    elif category in {"database", "postgres", "mssql"}:
        main = _project(
            f"Model and query a real dataset in {s}",
            "Choose a public dataset with at least a few hundred thousand rows.",
            f"Design the schema and indexes in {s}; write the three queries the data invites.",
            "Measure one query before and after an index or rewrite, and keep the numbers.",
        )
    elif category == "cloud":
        main = _project(
            f"Deploy a small service on {s}",
            f"Run a small API or job on {s} with infrastructure you can recreate from code.",
            "Add logging and one alert, and keep the monthly cost visible.",
            "Write a short README on what you would change for production.",
        )
    elif category in {"tool", "llm"}:
        main = _project(
            f"Use {s} in a project you already have",
            f"Add {s} where it solves a real problem (build, deploy, tests, data or monitoring).",
            "Note what changed: time, failures caught, or steps removed.",
        )
    elif category == "soft":
        return [
            Suggestion(
                "writeup",
                f"Write down a real example of {s}",
                [
                    "Pick one situation from work, study or volunteering where you showed it.",
                    "Write it as Situation, Task, Action, Result, with the result in numbers or "
                    "a quote you could share.",
                    "Use it as a bullet in the matching role; keep the full story for interviews.",
                ],
            )
        ]
    else:  # concepts, methods, practices
        main = Suggestion(
            "writeup",
            f"Apply {s} and write a short case study",
            [
                f"Apply {s} to something real, even small: your own project, a past job, a course.",
                "Write one page: the problem, what you did, what changed, what you would redo.",
                _LAST_STEP,
            ],
        )
    cert = Suggestion(
        "certification",
        f"Earn a recognised {s} certification",
        [
            f"Check which {s} certifications the jobs you saved actually mention; choose that one.",
            "Prefer one with a proctored exam and a public verification link.",
            "Add it to Certifications with the issuer, date and verification link.",
        ],
    )
    return [main, cert] if category in {"cloud", "database", "language", "tool"} else [main]
