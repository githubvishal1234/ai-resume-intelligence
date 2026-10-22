"""ATS-safe resume templates (the final set is pending Decision Register D-10).

Every template is single-column, embeds a Unicode font (app/output/fonts), uses standard
section headings and real text (no images, tables or text boxes), so applicant tracking
systems can read it in order.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

# Reading order of the standard sections. "Other" sections always come last.
RESUME_ORDER = ("summary", "experience", "education", "skills", "projects", "certifications")
# A CV leads with education and keeps everything; certifications and projects before skills.
CV_ORDER = ("summary", "education", "experience", "projects", "certifications", "skills")


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
    # "banner": name and contact on a solid accent band; "stripe": an accent bar down the left
    # edge of every page. Both are decoration around real text, so reading order is unchanged.
    header: Literal["plain", "banner", "stripe"] = "plain"
    heading_band: bool = False  # section headings on a light tint of the accent
    kind: Literal["resume", "cv"] = "resume"
    order: tuple[str, ...] = RESUME_ORDER


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
    "cv-academic": Template(
        id="cv-academic",
        name="Academic CV",
        description="Serif CV that leads with education, then research and teaching roles.",
        font="DejaVuSerif",
        font_bold="DejaVuSerif-Bold",
        body_size=10.5,
        name_size=21,
        heading_size=12,
        margin_mm=20,
        heading_rule=True,
        accent="#7a1f3d",
        center_header=True,
        kind="cv",
        order=CV_ORDER,
    ),
    "cv-professional": Template(
        id="cv-professional",
        name="Professional CV",
        description="Full-length CV in clean sans-serif; experience first, every section kept.",
        font="DejaVuSans",
        font_bold="DejaVuSans-Bold",
        body_size=10,
        name_size=22,
        heading_size=11.5,
        margin_mm=18,
        heading_rule=True,
        accent="#0f5e63",
        kind="cv",
        order=("summary", "experience", "education", "projects", "certifications", "skills"),
    ),
}

# Colour families for the generated designs. Every one keeps white text on it above 4.5:1.
PALETTES = {
    "navy": "#1f3a5f",
    "teal": "#0f6366",
    "burgundy": "#8a1c3b",
    "forest": "#2f6b3a",
    "plum": "#5b3aa8",
    "charcoal": "#374151",
}

_SANS = {"font": "DejaVuSans", "font_bold": "DejaVuSans-Bold"}
_SERIF = {"font": "DejaVuSerif", "font_bold": "DejaVuSerif-Bold"}

# Designs offered in every palette; ids are "<design>-<palette>", e.g. "banner-teal".
DESIGNS: dict[str, dict[str, Any]] = {
    "banner": {
        "name": "Banner",
        "description": "Name and contact on a solid colour band, ruled headings.",
        **_SANS, "body_size": 10, "name_size": 22, "heading_size": 11.5, "margin_mm": 16,
        "heading_rule": True, "header": "banner",
    },
    "stripe": {
        "name": "Stripe",
        "description": "A colour stripe down the left edge and colour headings.",
        **_SANS, "body_size": 10, "name_size": 22, "heading_size": 12, "margin_mm": 18,
        "heading_rule": False, "header": "stripe",
    },
    "ribbon": {
        "name": "Ribbon",
        "description": "Section headings on soft colour ribbons, plenty of white space.",
        **_SANS, "body_size": 10, "name_size": 21, "heading_size": 11, "margin_mm": 16,
        "heading_rule": False, "heading_band": True,
    },
    "elegant": {
        "name": "Elegant",
        "description": "Serif type, a centred name and soft colour ribbons.",
        **_SERIF, "body_size": 10.5, "name_size": 22, "heading_size": 12, "margin_mm": 18,
        "heading_rule": False, "heading_band": True, "center_header": True,
    },
    "statement": {
        "name": "Statement",
        "description": "Serif name on a colour band with ruled serif headings.",
        **_SERIF, "body_size": 10.5, "name_size": 23, "heading_size": 12, "margin_mm": 17,
        "heading_rule": True, "header": "banner", "center_header": True,
    },
}  # fmt: skip

for _design, _spec in DESIGNS.items():
    for _palette, _hex in PALETTES.items():
        _id = f"{_design}-{_palette}"
        TEMPLATES[_id] = Template(
            **{**_spec, "id": _id, "name": f"{_spec['name']} · {_palette.title()}", "accent": _hex}
        )

# Section headings used in every template, in reading order.
HEADINGS = {
    "summary": "Summary",
    "experience": "Experience",
    "education": "Education",
    "skills": "Skills",
    "projects": "Projects",
    "certifications": "Certifications",
}
