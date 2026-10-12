"""Embedded TrueType fonts for PDF output.

The DejaVu fonts (see fonts/LICENSE) cover Latin, Greek, Cyrillic and many symbols, so names
like "José Núñez" and symbols like ₹ or → render as real text. Only the glyphs a PDF uses are
embedded. Scripts the fonts do not cover (for example CJK) are reported by the ATS check.
"""

from __future__ import annotations

from functools import cache
from pathlib import Path

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

FONT_DIR = Path(__file__).parent / "fonts"

FONT_FILES = {
    "DejaVuSans": "DejaVuSans.ttf",
    "DejaVuSans-Bold": "DejaVuSans-Bold.ttf",
    "DejaVuSerif": "DejaVuSerif.ttf",
    "DejaVuSerif-Bold": "DejaVuSerif-Bold.ttf",
}


@cache
def register(name: str) -> TTFont:
    """Register a bundled font with reportlab once and return it."""
    font = TTFont(name, str(FONT_DIR / FONT_FILES[name]))
    pdfmetrics.registerFont(font)
    return font


@cache
def coverage(name: str) -> frozenset[int]:
    """Code points the font has a glyph for."""
    return frozenset(register(name).face.charToGlyph)
