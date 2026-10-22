"""Text-extractable PDF rendering with embedded Unicode fonts.

Each template names a bundled TrueType font (see app/output/fonts.py). Characters the font has
no glyph for are reported by the ATS check instead of being silently dropped; here they are
spelled out where there is a readable equivalent, otherwise replaced, so the PDF never shows
empty boxes.
"""

from __future__ import annotations

import io
from collections.abc import Callable
from datetime import date
from xml.sax.saxutils import escape

from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.flowables import Flowable

from app.output import fonts
from app.output.templates import HEADINGS, Template
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


def render_pdf(content: ResumeContent, template: Template, title: str = "Resume") -> bytes:
    t = template
    fonts.register(t.font)
    fonts.register(t.font_bold)
    _safe = _make_safe(t)

    def _p(text: str, style: ParagraphStyle) -> Paragraph:
        return Paragraph(escape(_safe(text)), style)

    accent = HexColor(t.accent)
    base = ParagraphStyle("body", fontName=t.font, fontSize=t.body_size, leading=t.body_size * 1.35)
    header_align = TA_CENTER if t.center_header else TA_LEFT
    name_style = ParagraphStyle(
        "name",
        parent=base,
        fontName=t.font_bold,
        fontSize=t.name_size,
        leading=t.name_size * 1.2,
        alignment=header_align,
    )
    contact_style = ParagraphStyle("contact", parent=base, spaceAfter=4, alignment=header_align)
    heading = ParagraphStyle(
        "heading",
        parent=base,
        fontName=t.font_bold,
        fontSize=t.heading_size,
        leading=t.heading_size * 1.3,
        textColor=accent,
        spaceBefore=t.body_size * (1.4 if t.heading_band else 0.9),
        spaceAfter=5 if t.heading_band else 2,
        backColor=tint(t.accent) if t.heading_band else None,
        borderPadding=(2, 4, 2, 4) if t.heading_band else 0,
    )
    entry = ParagraphStyle("entry", parent=base, fontName=t.font_bold)
    meta = ParagraphStyle("meta", parent=base, fontSize=t.body_size - 0.5)
    bullet = ParagraphStyle(
        "bullet", parent=base, leftIndent=10, bulletIndent=0, spaceBefore=1, bulletFontName=t.font
    )

    story: list[Flowable] = []
    c = content
    contact = " | ".join(
        p for p in (c.contact.email, c.contact.phone, c.contact.location, *c.contact.links) if p
    )
    if t.header == "banner":
        name_style.textColor = contact_style.textColor = white
        contact_style.spaceAfter = 0
    head: list[Flowable] = []
    if c.contact.full_name:
        head.append(_p(c.contact.full_name, name_style))
    if contact:
        head.append(_p(contact, contact_style))
    if t.header == "banner" and head:
        band = Table([[head]], colWidths=["100%"])
        band.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), accent),
                    ("LEFTPADDING", (0, 0), (-1, -1), 12),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                    ("TOPPADDING", (0, 0), (-1, -1), 10),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ]
            )
        )
        story += [band, Spacer(1, 4)]
    else:
        story += head

    def section(key: str) -> None:
        story.append(_p(HEADINGS[key], heading))
        if t.heading_rule:
            story.append(HRFlowable(width="100%", thickness=0.6, color=accent, spaceAfter=3))

    def bullets(lines: list[str]) -> list[Flowable]:
        return [Paragraph(escape(_safe(b)), bullet, bulletText="•") for b in lines]

    def summary() -> None:
        if c.summary:
            section("summary")
            story.append(_p(c.summary, base))

    def experience() -> None:
        if not c.experience:
            return
        section("experience")
        for e in c.experience:
            head = " — ".join(p for p in (e.title, e.company) if p)
            when = " | ".join(
                p for p in (_dates(e.start_date, e.end_date, e.current), e.location) if p
            )
            block: list[Flowable] = [_p(head or "Role", entry)]
            if when:
                block.append(_p(when, meta))
            block += bullets(e.bullets)
            block.append(Spacer(1, 4))
            story.append(KeepTogether(block[:3]))
            story.extend(block[3:])

    def education() -> None:
        if not c.education:
            return
        section("education")
        for d in c.education:
            degree = " in ".join(p for p in (d.degree, d.field_of_study) if p)
            story.append(_p(degree or d.institution, entry))
            line = " | ".join(
                p for p in (d.institution if degree else "", _dates(d.start_date, d.end_date)) if p
            )
            if line:
                story.append(_p(line, meta))
            story.extend(bullets(d.details))
            story.append(Spacer(1, 3))

    def skills() -> None:
        if not c.skills:
            return
        section("skills")
        groups: dict[str, list[str]] = {}
        for s in c.skills:
            groups.setdefault(s.category, []).append(s.name)
        for category, names in groups.items():
            label = f"{category}: " if category else ""
            story.append(_p(label + ", ".join(names), base))

    def projects() -> None:
        if not c.projects:
            return
        section("projects")
        for p in c.projects:
            story.append(_p(p.name or "Project", entry))
            if p.technologies:
                story.append(_p(", ".join(p.technologies), meta))
            if p.description:
                story.append(_p(p.description, base))
            story.extend(bullets(p.bullets))
            story.append(Spacer(1, 3))

    def certifications() -> None:
        if not c.certifications:
            return
        section("certifications")
        for x in c.certifications:
            story.append(_p(" — ".join(v for v in (x.name, x.issuer, x.date) if v), base))

    sections: dict[str, Callable[[], None]] = {
        "summary": summary,
        "experience": experience,
        "education": education,
        "skills": skills,
        "projects": projects,
        "certifications": certifications,
    }
    for key in t.order:
        sections[key]()
    for o in c.other:
        story.append(_p(o.heading or "Additional information", heading))
        if t.heading_rule:
            story.append(HRFlowable(width="100%", thickness=0.6, color=accent, spaceAfter=3))
        story += bullets(o.lines)

    out = io.BytesIO()
    margin = t.margin_mm * mm
    doc = SimpleDocTemplate(
        out,
        pagesize=A4,
        leftMargin=margin,
        rightMargin=margin,
        topMargin=margin,
        bottomMargin=margin,
        title=_safe(title),
        author=_safe(c.contact.full_name),
        creator="Resume Intelligence",
    )

    def stripe(canvas: Canvas, _doc: SimpleDocTemplate) -> None:
        if t.header == "stripe":
            canvas.setFillColor(accent)
            canvas.rect(0, 0, 5 * mm, A4[1], stroke=0, fill=1)

    doc.build(story or [_p(" ", base)], onFirstPage=stripe, onLaterPages=stripe)
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
