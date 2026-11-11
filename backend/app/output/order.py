"""The order of a resume's sections: the user's own, or one suited to their experience.

A resume with no saved order gets a suggestion from what it holds (frontend mirror:
frontend/src/lib/sectionOrder.ts). The template's own order applies when there is none.
"""

from __future__ import annotations

from datetime import date

from app.matching.matcher import experience_years
from app.resumes.content import ResumeContent

# Under a year of work: projects are the stronger proof, so they come before experience.
FRESHER_ORDER = ("summary", "skills", "projects", "experience", "education", "certifications")
# No work yet: the degree is the main credential.
STUDENT_ORDER = ("summary", "education", "skills", "projects", "experience", "certifications")


def suggested_order(content: ResumeContent, today: date | None = None) -> list[str]:
    """A full section order for freshers and students; [] keeps the template's order."""
    roles = [e for e in content.experience if e.title.strip() or e.company.strip()]
    if not roles:
        return list(STUDENT_ORDER) if content.education else []
    years, _ = experience_years(content, today or date.today())
    if years is not None and years < 1 and content.projects:
        return list(FRESHER_ORDER)
    return []


def section_order(content: ResumeContent, kind: str = "resume") -> list[str]:
    """The order to lay sections out in: the saved one, else a suggestion (resumes only)."""
    if content.section_order:
        return list(content.section_order)
    return suggested_order(content) if kind == "resume" else []
