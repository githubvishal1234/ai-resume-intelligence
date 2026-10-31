"""Text-extractable PDF rendering with embedded Unicode fonts.

Each template names a bundled TrueType font (see app/output/fonts.py). Characters the font has
no glyph for are reported by the ATS check instead of being silently dropped; here they are
spelled out where there is a readable equivalent, otherwise replaced, so the PDF never shows
empty boxes.
"""

from __future__ import annotations

import io
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from typing import Any
from xml.sax.saxutils import escape

from PIL import Image as PILImage
from PIL import ImageDraw, ImageOps
from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    FrameBreak,
    HRFlowable,
    Image,
    KeepTogether,
    NextPageTemplate,
    PageTemplate,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.flowables import Flowable

from app.output import fonts
from app.output.templates import HEADINGS, SIDEBAR_SECTIONS, Template, arrange
from app.resumes.content import Contact, ResumeContent

# Invisible characters that are dropped rather than reported.
_INVISIBLE = {"\u200b", "\u200c", "\u200d", "\ufeff"}

# Symbols with a readable spelling, used only when the font has no glyph for them.
_REPLACEMENTS = {"₹": "INR ", "→": "->", "≥": ">=", "≤": "<=", "✓": "-", "★": "*"}


def _coverage(template: Template) -> frozenset[int]:
    return fonts.coverage(template.font) & fonts.coverage(template.font_bold)


def unsupported_characters(text: str, template: Template) -> set[str]:
    """Characters in ``text`` the template's fonts cannot show (whitespace is always fine)."""
    covered = _coverage(template)
    return {
        ch
        for ch in set(text)
        if ord(ch) not in covered and not ch.isspace() and ch not in _INVISIBLE
    }


def _make_safe(template: Template) -> Callable[[str], str]:
    covered = _coverage(template)

    def safe(text: str) -> str:
        out: list[str] = []
        for ch in text:
            if ch in _INVISIBLE:
                continue
            if ord(ch) in covered or ch in "\n\t":
                out.append(ch)
            elif ch in _REPLACEMENTS:
                out.append(_REPLACEMENTS[ch])
            elif ch.isspace():
                out.append(" ")
            else:
                out.append("?")
        return "".join(out)

    return safe


def tint(hex_colour: str, amount: float = 0.12) -> Color:
    """``hex_colour`` mixed with white; ``amount`` is the share of the colour."""
    c = HexColor(hex_colour)
    return Color(*(1 - amount * (1 - v) for v in (c.red, c.green, c.blue)))


def _dates(start: str, end: str, current: bool = False) -> str:
    end_text = "Present" if current else end
    return " – ".join(p for p in (start, end_text) if p)


def circle_photo(data: bytes, px: int = 360) -> io.BytesIO:
    """The stored square photo as a round PNG (transparent corners), for the PDF."""
    with PILImage.open(io.BytesIO(data)) as im:
        square = ImageOps.fit(im.convert("RGB"), (px, px))
    mask = PILImage.new("L", (px, px), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, px - 1, px - 1), fill=255)
    square.putalpha(mask)
    out = io.BytesIO()
    square.save(out, format="PNG")
    out.seek(0)
    return out


@dataclass
class _Styles:
    base: ParagraphStyle
    name: ParagraphStyle
    headline: ParagraphStyle
    contact: ParagraphStyle
    heading: ParagraphStyle
    entry: ParagraphStyle
    meta: ParagraphStyle
    meta_right: ParagraphStyle
    bullet: ParagraphStyle
    rule: Color


def _styles(t: Template, prefix: str, text: Color, heading_colour: Color, band: bool) -> _Styles:
    base = ParagraphStyle(
        f"{prefix}body",
        fontName=t.font,
        fontSize=t.body_size,
        leading=t.body_size * t.line_height,
        textColor=text,
    )
    align = TA_CENTER if t.center_header else TA_LEFT
    return _Styles(
        base=base,
        name=ParagraphStyle(
            f"{prefix}name",
            parent=base,
            fontName=t.font_bold,
            fontSize=t.name_size,
            leading=t.name_size * 1.2,
            alignment=align,
        ),
        headline=ParagraphStyle(
            f"{prefix}headline", parent=base, fontName=t.font_bold, spaceBefore=1, alignment=align
        ),
        contact=ParagraphStyle(f"{prefix}contact", parent=base, spaceAfter=4, alignment=align),
        heading=ParagraphStyle(
            f"{prefix}heading",
            parent=base,
            fontName=t.font_bold,
            fontSize=t.heading_size,
            leading=t.heading_size * 1.3,
            textColor=heading_colour,
            spaceBefore=t.body_size * (1.4 if band else 0.9),
            spaceAfter=5 if band else 2,
            backColor=tint(t.accent) if band else None,
            borderPadding=(2, 4, 2, 4) if band else 0,
        ),
        entry=ParagraphStyle(f"{prefix}entry", parent=base, fontName=t.font_bold),
        meta=ParagraphStyle(f"{prefix}meta", parent=base, fontSize=t.body_size - 0.5),
        meta_right=ParagraphStyle(
            f"{prefix}metar", parent=base, fontSize=t.body_size - 0.5, alignment=TA_RIGHT
        ),
        bullet=ParagraphStyle(
            f"{prefix}bullet",
            parent=base,
            leftIndent=10,
            bulletIndent=0,
            spaceBefore=1,
            bulletFontName=t.font,
        ),
        rule=heading_colour,
    )


_PLAIN_TABLE = [
    ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ("TOPPADDING", (0, 0), (-1, -1), 0),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
]


def render_pdf(
    content: ResumeContent, template: Template, title: str = "Resume", photo: bytes | None = None
) -> bytes:
    """`photo` (the user's stored photo) is drawn only by templates with `photo=True`."""
    t = template
    fonts.register(t.font)
    fonts.register(t.font_bold)
    _safe = _make_safe(t)
    c = content

    def _p(text: str, style: ParagraphStyle) -> Paragraph:
        return Paragraph(escape(_safe(text)), style)

    def _lines(parts: list[str], style: ParagraphStyle) -> Paragraph:
        return Paragraph("<br/>".join(escape(_safe(p)) for p in parts), style)

    accent = HexColor(t.accent)
    black = HexColor("#111111")
    margin = t.margin_mm * mm
    full_w = A4[0] - 2 * margin
    sidebar = t.layout == "sidebar"
    side_w = full_w * 0.32 if sidebar else 0.0
    gap = 7 * mm if sidebar else 0.0
    # SimpleDocTemplate frames pad 6 pt on each side; the sidebar frames are built with none.
    main_w = full_w - side_w - gap - (0 if sidebar else 12)
    main = _styles(t, "m", black, accent, t.heading_band)
    on_solid = sidebar and t.sidebar_fill == "solid"
    side = _styles(t, "s", white if on_solid else black, white if on_solid else accent, False)
    if t.header == "banner":
        main.name.textColor = main.contact.textColor = white
        main.contact.spaceAfter = 0
    image = Image(circle_photo(photo), 26 * mm, 26 * mm, mask="auto") if t.photo and photo else None

    contact_parts = [
        p for p in (c.contact.email, c.contact.phone, c.contact.location, *c.contact.links) if p
    ]
    contact = " | ".join(contact_parts)

    def table(rows: list[list[Any]], widths: list[float], extra: list[Any] | None = None) -> Table:
        tbl = Table(rows, colWidths=widths)
        tbl.setStyle(TableStyle(_PLAIN_TABLE + (extra or [])))
        return tbl

    # ---- header -------------------------------------------------------------------------
    def header() -> list[Flowable]:
        s = main
        name = _p(c.contact.full_name, s.name) if c.contact.full_name else None
        title = _p(c.contact.headline, s.headline) if c.contact.headline else None
        line = _p(contact, s.contact) if contact else None
        block = [f for f in (name, title, line) if f]
        if not block:
            return []
        if t.header == "banner":
            band = table(
                [[block]],
                [main_w],
                [
                    ("BACKGROUND", (0, 0), (-1, -1), accent),
                    ("LEFTPADDING", (0, 0), (-1, -1), 12),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                    ("TOPPADDING", (0, 0), (-1, -1), 10),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ],
            )
            return [band, Spacer(1, 4)]
        if t.header == "split" and name:
            right = _lines(contact_parts, s.meta_right) if contact_parts else ""
            left = [f for f in (name, title) if f]
            return [table([[left, right]], [main_w * 0.55, main_w * 0.45]), Spacer(1, 6)]
        if t.header == "monogram" and name:
            initials = "".join(w[0] for w in c.contact.full_name.split()[:2]).upper()
            mono_style = ParagraphStyle(
                "mono",
                parent=s.name,
                textColor=white,
                alignment=TA_CENTER,
                fontSize=t.name_size * 0.8,
                leading=t.name_size,
            )
            box = table(
                [[_p(initials, mono_style)]],
                [16 * mm],
                [
                    ("BACKGROUND", (0, 0), (-1, -1), accent),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("TOPPADDING", (0, 0), (-1, -1), 8),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ],
            )
            return [table([[box, block]], [16 * mm + 5 * mm, main_w - 21 * mm]), Spacer(1, 6)]
        if image is not None:
            return [
                table(
                    [[image, block]],
                    [26 * mm + 6 * mm, main_w - 32 * mm],
                    [("VALIGN", (0, 0), (-1, -1), "MIDDLE")],
                ),
                Spacer(1, 6),
            ]
        return block

    # ---- sections -----------------------------------------------------------------------
    def heading(text: str, s: _Styles) -> list[Flowable]:
        out: list[Flowable] = [_p(text.upper() if t.upper_headings else text, s.heading)]
        if t.heading_rule:
            out.append(HRFlowable(width="100%", thickness=0.6, color=s.rule, spaceAfter=3))
        return out

    def bullets(lines: list[str], s: _Styles) -> list[Flowable]:
        return [Paragraph(escape(_safe(b)), s.bullet, bulletText="•") for b in lines]

    def titled(head: str, when: str, s: _Styles, width: float) -> list[Flowable]:
        """An entry's title line, with its dates right-aligned when the template asks."""
        if t.dates_right and when:
            return [
                table([[_p(head, s.entry), _p(when, s.meta_right)]], [width * 0.7, width * 0.3])
            ]
        return [_p(head, s.entry)] + ([_p(when, s.meta)] if when else [])

    def dated(when: str, body: list[Flowable], s: _Styles, width: float) -> list[Flowable]:
        """Timeline layout: dates in a left gutter, the entry right of an accent line."""
        gutter = 25 * mm
        cell = [_p(when, s.meta_right)] if when else []
        return [
            table(
                [[cell, body]],
                [gutter, width - gutter],
                [
                    ("LINEBEFORE", (1, 0), (1, -1), 1.2, accent),
                    ("LEFTPADDING", (1, 0), (1, -1), 9),
                    ("RIGHTPADDING", (0, 0), (0, -1), 7),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ],
            )
        ]

    def summary(s: _Styles, width: float) -> list[Flowable]:
        return heading(HEADINGS["summary"], s) + [_p(c.summary, s.base)] if c.summary else []

    def experience(s: _Styles, width: float) -> list[Flowable]:
        if not c.experience:
            return []
        out = heading(HEADINGS["experience"], s)
        for e in c.experience:
            head = " — ".join(p for p in (e.title, e.company) if p) or "Role"
            when = _dates(e.start_date, e.end_date, e.current)
            if t.layout == "timeline":
                body = [_p(head, s.entry)] + ([_p(e.location, s.meta)] if e.location else [])
                out += dated(when, body + bullets(e.bullets, s), s, width)
                continue
            if t.dates_right:
                block = titled(head, when, s, width) + (
                    [_p(e.location, s.meta)] if e.location else []
                )
            else:
                block = titled(head, " | ".join(p for p in (when, e.location) if p), s, width)
            out.append(KeepTogether(block + bullets(e.bullets, s)[:1]))
            out += bullets(e.bullets, s)[1:] + [Spacer(1, 4)]
        return out

    def education(s: _Styles, width: float) -> list[Flowable]:
        if not c.education:
            return []
        out = heading(HEADINGS["education"], s)
        for d in c.education:
            degree = " in ".join(p for p in (d.degree, d.field_of_study) if p)
            when = _dates(d.start_date, d.end_date)
            school = d.institution if degree else ""
            if t.layout == "timeline":
                body = [_p(degree or d.institution, s.entry)] + (
                    [_p(school, s.meta)] if school else []
                )
                out += dated(when, body + bullets(d.details, s), s, width)
                continue
            if sidebar and s is side:  # narrow column: one fact per line
                out += [_p(degree or d.institution, s.entry)]
                out += [_p(x, s.meta) for x in (school, when) if x]
            elif t.dates_right:
                out += titled(degree or d.institution, when, s, width)
                out += [_p(school, s.meta)] if school else []
            else:
                out += titled(
                    degree or d.institution, " | ".join(p for p in (school, when) if p), s, width
                )
            out += bullets(d.details, s) + [Spacer(1, 3)]
        return out

    def skills(s: _Styles, width: float) -> list[Flowable]:
        if not c.skills:
            return []
        out = heading(HEADINGS["skills"], s)
        groups: dict[str, list[str]] = {}
        for sk in c.skills:
            groups.setdefault(sk.category, []).append(sk.name)
        for category, names in groups.items():
            if sidebar and s is side:  # one skill per line, under its category
                out += [_p(category, s.entry)] if category else []
                out += [_p(n, s.base) for n in names] + [Spacer(1, 3)]
            elif t.skills_grid:
                out += [_p(category, s.entry)] if category else []
                cells = [Paragraph(escape(_safe(n)), s.bullet, bulletText="•") for n in names]
                rows = [
                    cells[i : i + 3] + [""] * (3 - len(cells[i : i + 3]))
                    for i in range(0, len(cells), 3)
                ]
                out.append(table(rows, [width / 3] * 3, [("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
            else:
                out.append(_p((f"{category}: " if category else "") + ", ".join(names), s.base))
        return out

    def projects(s: _Styles, width: float) -> list[Flowable]:
        if not c.projects:
            return []
        out = heading(HEADINGS["projects"], s)
        for p in c.projects:
            out.append(_p(p.name or "Project", s.entry))
            if p.technologies:
                out.append(_p(", ".join(p.technologies), s.meta))
            if p.description:
                out.append(_p(p.description, s.base))
            out += bullets(p.bullets, s) + [Spacer(1, 3)]
        return out

    def certifications(s: _Styles, width: float) -> list[Flowable]:
        if not c.certifications:
            return []
        out = heading(HEADINGS["certifications"], s)
        for x in c.certifications:
            if sidebar and s is side:
                out += [_p(x.name, s.entry)] + [_p(v, s.meta) for v in (x.issuer, x.date) if v]
            else:
                out.append(_p(" — ".join(v for v in (x.name, x.issuer, x.date) if v), s.base))
        return out

    builders: dict[str, Callable[[_Styles, float], list[Flowable]]] = {
        "summary": summary,
        "experience": experience,
        "education": education,
        "skills": skills,
        "projects": projects,
        "certifications": certifications,
    }

    side_story: list[Flowable] = []
    main_story: list[Flowable] = []
    if sidebar:
        if image is not None:
            side_story += [image, Spacer(1, 6)]
        if c.contact.full_name:
            side_story.append(_p(c.contact.full_name, side.name))
        if c.contact.headline:
            side_story.append(_p(c.contact.headline, side.headline))
        side_story += [Spacer(1, 4)] + [_p(x, side.meta) for x in contact_parts]
    else:
        main_story += header()
    for key in arrange(t.order, list(c.section_order)):
        in_side = sidebar and key in SIDEBAR_SECTIONS
        target = side_story if in_side else main_story
        target += builders[key](side if in_side else main, side_w if in_side else main_w)
    for o in c.other:
        main_story += heading(o.heading or "Additional information", main) + bullets(o.lines, main)

    out = io.BytesIO()
    meta_kw: dict[str, Any] = {
        "title": _safe(title),
        "author": _safe(c.contact.full_name),
        "creator": "Resume Intelligence",
    }

    def paint(canvas: Canvas, _doc: BaseDocTemplate) -> None:
        if t.header == "stripe":
            canvas.setFillColor(accent)
            canvas.rect(0, 0, 5 * mm, A4[1], stroke=0, fill=1)
        if sidebar:
            canvas.setFillColor(accent if on_solid else tint(t.accent, 0.1))
            canvas.rect(0, 0, margin + side_w + gap * 0.45, A4[1], stroke=0, fill=1)

    if not sidebar:
        doc = SimpleDocTemplate(
            out,
            pagesize=A4,
            leftMargin=margin,
            rightMargin=margin,
            topMargin=margin,
            bottomMargin=margin,
            **meta_kw,
        )
        doc.build(main_story or [_p(" ", main.base)], onFirstPage=paint, onLaterPages=paint)
        return out.getvalue()

    # Sidebar: page one has the sidebar frame (filled and read first), then the main frame;
    # later pages continue the main column only.
    # ponytail: a sidebar taller than one page spills into the main frame; cap its content
    # (or give later pages a sidebar frame too) if that ever happens.
    height = A4[1] - 2 * margin
    main_x = margin + side_w + gap
    doc = BaseDocTemplate(
        out,
        pagesize=A4,
        leftMargin=margin,
        rightMargin=margin,
        topMargin=margin,
        bottomMargin=margin,
        **meta_kw,
    )
    doc.addPageTemplates(
        [
            PageTemplate(
                "first",
                frames=[
                    Frame(margin, margin, side_w, height, 0, 0, 0, 0, id="side"),
                    Frame(main_x, margin, main_w, height, 0, 0, 0, 0, id="main"),
                ],
                onPage=paint,
            ),
            PageTemplate(
                "rest", frames=[Frame(main_x, margin, main_w, height, 0, 0, 0, 0)], onPage=paint
            ),
        ]
    )
    doc.build([NextPageTemplate("rest"), *side_story, FrameBreak(), *main_story])
    return out.getvalue()


def render_letter(
    contact: Contact,
    recipient: str,
    company: str,
    body: str,
    template: Template,
    when: date,
    title: str = "Cover letter",
) -> bytes:
    """A one-column cover letter in the template's fonts and colour, header matching the resume."""
    t = template
    fonts.register(t.font)
    fonts.register(t.font_bold)
    _safe = _make_safe(t)

    def _p(text: str, style: ParagraphStyle) -> Paragraph:
        return Paragraph(escape(_safe(text)), style)

    accent = HexColor(t.accent)
    base = ParagraphStyle(
        "body", fontName=t.font, fontSize=t.body_size + 0.5, leading=(t.body_size + 0.5) * 1.45
    )
    align = TA_CENTER if t.center_header else TA_LEFT
    name_style = ParagraphStyle(
        "name", parent=base, fontName=t.font_bold, fontSize=t.name_size, leading=t.name_size * 1.2,
        textColor=accent, alignment=align,
    )  # fmt: skip
    small = ParagraphStyle("contact", parent=base, fontSize=t.body_size, alignment=align)
    para = ParagraphStyle("para", parent=base, spaceAfter=t.body_size * 0.9)

    story: list[Flowable] = []
    if contact.full_name:
        story.append(_p(contact.full_name, name_style))
    line = " | ".join(
        p for p in (contact.email, contact.phone, contact.location, *contact.links) if p
    )
    if line:
        story.append(_p(line, small))
    if t.heading_rule:
        story.append(HRFlowable(width="100%", thickness=0.6, color=accent, spaceBefore=6))
    story.append(Spacer(1, 14))
    story.append(_p(f"{when.day} {when.strftime('%B %Y')}", para))
    for part in (recipient, company):
        if part.strip():
            story.append(_p(part, base))
    story.append(Spacer(1, 10))
    story.append(_p(f"Dear {recipient.strip() or 'Hiring Manager'},", para))
    for chunk in [c.strip() for c in body.split("\n\n") if c.strip()]:
        story.append(_p(" ".join(chunk.split()), para))
    story.append(_p("Sincerely,", base))
    story.append(Spacer(1, 4))
    story.append(
        _p(contact.full_name or " ", ParagraphStyle("sign", parent=base, fontName=t.font_bold))
    )

    out = io.BytesIO()
    margin = (t.margin_mm + 4) * mm
    doc = SimpleDocTemplate(
        out, pagesize=A4, leftMargin=margin, rightMargin=margin, topMargin=margin,
        bottomMargin=margin, title=_safe(title), author=_safe(contact.full_name),
        creator="Resume Intelligence",
    )  # fmt: skip
    doc.build(story)
    return out.getvalue()
