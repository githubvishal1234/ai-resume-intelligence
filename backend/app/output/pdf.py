"""Text-extractable PDF rendering with embedded Unicode fonts.

Each template names a bundled TrueType font (see app/output/fonts.py). Characters the font has
no glyph for are reported by the ATS check instead of being silently dropped; here they are
spelled out where there is a readable equivalent, otherwise replaced, so the PDF never shows
empty boxes.
"""

from __future__ import annotations

import io
from collections.abc import Callable
from xml.sax.saxutils import escape

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import HRFlowable, KeepTogether, Paragraph, SimpleDocTemplate, Spacer
from reportlab.platypus.flowables import Flowable

from app.output import fonts
from app.output.templates import HEADINGS, Template
from app.resumes.content import ResumeContent

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
    name_style = ParagraphStyle(
        "name", parent=base, fontName=t.font_bold, fontSize=t.name_size, leading=t.name_size * 1.2
    )
    contact_style = ParagraphStyle("contact", parent=base, spaceAfter=4)
    heading = ParagraphStyle(
        "heading",
        parent=base,
        fontName=t.font_bold,
        fontSize=t.heading_size,
        leading=t.heading_size * 1.3,
        textColor=accent,
        spaceBefore=t.body_size * 0.9,
        spaceAfter=2,
    )
    entry = ParagraphStyle("entry", parent=base, fontName=t.font_bold)
    meta = ParagraphStyle("meta", parent=base, fontSize=t.body_size - 0.5)
    bullet = ParagraphStyle(
        "bullet", parent=base, leftIndent=10, bulletIndent=0, spaceBefore=1, bulletFontName=t.font
    )

    story: list[Flowable] = []
    c = content
    if c.contact.full_name:
        story.append(_p(c.contact.full_name, name_style))
    contact = " | ".join(
        p for p in (c.contact.email, c.contact.phone, c.contact.location, *c.contact.links) if p
    )
    if contact:
        story.append(_p(contact, contact_style))

    def section(key: str) -> None:
        story.append(_p(HEADINGS[key], heading))
        if t.heading_rule:
            story.append(HRFlowable(width="100%", thickness=0.6, color=accent, spaceAfter=3))

    def bullets(lines: list[str]) -> list[Flowable]:
        return [Paragraph(escape(_safe(b)), bullet, bulletText="•") for b in lines]

    if c.summary:
        section("summary")
        story.append(_p(c.summary, base))
    if c.experience:
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
    if c.education:
        section("education")
        for d in c.education:
            degree = " in ".join(p for p in (d.degree, d.field_of_study) if p)
            story.append(_p(degree or d.institution, entry))
            line = " | ".join(
                p for p in (d.institution if degree else "", _dates(d.start_date, d.end_date)) if p
            )
            if line:
                story.append(_p(line, meta))
            story += bullets(d.details)
            story.append(Spacer(1, 3))
    if c.skills:
        section("skills")
        groups: dict[str, list[str]] = {}
        for s in c.skills:
            groups.setdefault(s.category, []).append(s.name)
        for category, names in groups.items():
            label = f"{category}: " if category else ""
            story.append(_p(label + ", ".join(names), base))
    if c.projects:
        section("projects")
        for p in c.projects:
            story.append(_p(p.name or "Project", entry))
            if p.technologies:
                story.append(_p(", ".join(p.technologies), meta))
            if p.description:
                story.append(_p(p.description, base))
            story += bullets(p.bullets)
            story.append(Spacer(1, 3))
    if c.certifications:
        section("certifications")
        for x in c.certifications:
            story.append(_p(" — ".join(v for v in (x.name, x.issuer, x.date) if v), base))
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
    doc.build(story or [_p(" ", base)])
    return out.getvalue()
