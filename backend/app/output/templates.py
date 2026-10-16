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
    center_header: bool = False  # name and contact line centred (still one column)


# The frontend preview mirrors these values in frontend/src/constants/templates.ts.
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
    "modern": Template(
        id="modern",
        name="Modern",
        description="Indigo headings, a large name and ruled sections.",
        font="DejaVuSans",
        font_bold="DejaVuSans-Bold",
        body_size=10,
        name_size=22,
        heading_size=11.5,
        margin_mm=16,
        heading_rule=True,
        accent="#3730a3",
    ),
    "executive": Template(
        id="executive",
        name="Executive",
        description="Serif type, centred name and navy ruled headings.",
        font="DejaVuSerif",
        font_bold="DejaVuSerif-Bold",
        body_size=10.5,
        name_size=22,
        heading_size=12,
        margin_mm=18,
        heading_rule=True,
        accent="#1f2a44",
        center_header=True,
    ),
    "minimal": Template(
        id="minimal",
        name="Minimal",
        description="Centred header, wide margins and quiet grey headings.",
        font="DejaVuSans",
        font_bold="DejaVuSans-Bold",
        body_size=10,
        name_size=18,
        heading_size=11,
        margin_mm=20,
        heading_rule=False,
        accent="#374151",
        center_header=True,
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
