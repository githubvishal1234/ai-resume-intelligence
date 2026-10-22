"""Resume templates (the final set is pending Decision Register D-10).

Every template embeds a Unicode font (app/output/fonts), uses standard section headings and
real, selectable text in a fixed reading order, so applicant tracking systems can read it.
- Single-column layouts are ATS-safe.
- Sidebar and timeline layouts are "ATS-friendly": the PDF draws the sidebar first and then
  the main column (and dates before each role), so text still reads in `order`, but some
  older parsers handle columns and tables less well. The gallery labels them.
- A photo is an image next to the text; it is never required and the ATS check notes it.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

# Reading order of the standard sections. "Other" sections always come last.
RESUME_ORDER = ("summary", "experience", "education", "skills", "projects", "certifications")
# A CV leads with education and keeps everything; certifications and projects before skills.
CV_ORDER = ("summary", "education", "experience", "projects", "certifications", "skills")
# Sidebar layouts: these sections go in the sidebar, which is drawn (and read) first.
SIDEBAR_SECTIONS = ("skills", "certifications", "education")
SIDEBAR_ORDER = (*SIDEBAR_SECTIONS, "summary", "experience", "projects")


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
    # "split": name left, contact stacked right. "monogram": initials in an accent square.
    header: Literal["plain", "banner", "stripe", "split", "monogram"] = "plain"
    heading_band: bool = False  # section headings on a light tint of the accent
    layout: Literal["single", "sidebar", "timeline"] = "single"
    sidebar_fill: Literal["solid", "tint"] = "solid"  # sidebar background: accent, or a tint
    photo: bool = False  # shows the user's profile photo when they have uploaded one
    dates_right: bool = False  # each role's dates right-aligned on its title line
    skills_grid: bool = False  # skills in three columns instead of comma lists
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
    "sidebar": {
        "name": "Sidebar",
        "description": "A solid colour sidebar with contact, skills and education.",
        **_SANS, "body_size": 9.5, "name_size": 19, "heading_size": 11, "margin_mm": 13,
        "heading_rule": True, "layout": "sidebar", "order": SIDEBAR_ORDER,
    },
    "portfolio": {
        "name": "Portfolio",
        "description": "A soft sidebar with your photo, contact and skills.",
        **_SANS, "body_size": 9.5, "name_size": 18, "heading_size": 11, "margin_mm": 13,
        "heading_rule": True, "layout": "sidebar", "sidebar_fill": "tint", "photo": True,
        "order": SIDEBAR_ORDER,
    },
    "timeline": {
        "name": "Timeline",
        "description": "Roles on a timeline, dates in the margin, colour headings.",
        **_SANS, "body_size": 9.5, "name_size": 22, "heading_size": 11.5, "margin_mm": 15,
        "heading_rule": False, "layout": "timeline", "skills_grid": True,
    },
    "split": {
        "name": "Split",
        "description": "Name on the left, contact on the right, dates aligned right.",
        **_SANS, "body_size": 10, "name_size": 22, "heading_size": 11.5, "margin_mm": 16,
        "heading_rule": True, "header": "split", "dates_right": True,
    },
    "monogram": {
        "name": "Monogram",
        "description": "Serif type with your initials in a colour square.",
        **_SERIF, "body_size": 10, "name_size": 21, "heading_size": 12, "margin_mm": 17,
        "heading_rule": True, "header": "monogram", "dates_right": True,
    },
    "ledger": {
        "name": "Ledger",
        "description": "Compact and tidy: dates right, skills in a three-column grid.",
        **_SANS, "body_size": 9.5, "name_size": 18, "heading_size": 10.5, "margin_mm": 13,
        "heading_rule": True, "dates_right": True, "skills_grid": True,
    },
    "portrait": {
        "name": "Portrait",
        "description": "One column with your photo beside the name.",
        **_SANS, "body_size": 10, "name_size": 22, "heading_size": 11.5, "margin_mm": 16,
        "heading_rule": True, "photo": True,
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
