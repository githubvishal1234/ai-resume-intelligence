"""ATS-safe resume templates (the final set is pending Decision Register D-10).

Every template is single-column, embeds a Unicode font (app/output/fonts), uses standard
section headings and real text (no images, tables or text boxes), so applicant tracking
systems can read it in order.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Template:
    id: str
    name: str
    description: str
    font: str
    font_bold: str
    body_size: float
    name_size: float
    heading_size: float
    margin_mm: float
    heading_rule: bool
    accent: str  # hex colour for headings; body text is always black


TEMPLATES: dict[str, Template] = {
    "classic": Template(
        id="classic",
        name="Classic",
        description="Clean sans-serif, generous spacing, ruled section headings.",
        font="DejaVuSans",
        font_bold="DejaVuSans-Bold",
        body_size=10.5,
        name_size=20,
        heading_size=11.5,
        margin_mm=18,
        heading_rule=True,
        accent="#1f2a44",
    ),
    "compact": Template(
        id="compact",
        name="Compact",
        description="Tighter spacing to fit more on a page; plain headings.",
        font="DejaVuSans",
        font_bold="DejaVuSans-Bold",
        body_size=9.5,
        name_size=16,
        heading_size=10.5,
        margin_mm=13,
        heading_rule=False,
        accent="#000000",
    ),
    "serif": Template(
        id="serif",
        name="Serif",
        description="Serif type for a traditional look, ruled headings.",
        font="DejaVuSerif",
        font_bold="DejaVuSerif-Bold",
        body_size=11,
        name_size=20,
        heading_size=12,
        margin_mm=18,
        heading_rule=True,
        accent="#000000",
    ),
}

# Section headings used in every template, in reading order.
HEADINGS = {
    "summary": "Summary",
    "experience": "Experience",
    "education": "Education",
    "skills": "Skills",
    "projects": "Projects",
    "certifications": "Certifications",
}
