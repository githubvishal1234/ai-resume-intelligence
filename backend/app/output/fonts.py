"""Embedded TrueType fonts for PDF output.

The DejaVu fonts (see fonts/LICENSE) cover Latin, Greek, Cyrillic and many symbols, so names
like "José Núñez" and symbols like ₹ or → render as real text. Only the glyphs a PDF uses are
embedded. Scripts the fonts do not cover (for example CJK) are reported by the ATS check.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Literal

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

FONT_DIR = Path(__file__).parent / "fonts"

FontStyle = Literal["sans", "modern", "serif", "condensed"]


@dataclass(frozen=True)
class FontChoice:
    """A font the user can pick instead of the template's own. `id` names its two files."""

    id: str
    name: str
    style: FontStyle


# Free fonts from Google Fonts under the SIL Open Font License (see fonts/OFL.txt): static
# regular and bold cuts, cut down to Latin, Greek, Cyrillic and symbols. Lato and Carlito ship
# unmodified, because their licences reserve their names for the originals. All are plain,
# ATS-friendly faces. Calibri itself is Microsoft's and can't be bundled; Carlito is the free
# font drawn to Calibri's letter widths, so text takes the same space.
CHOICES = [
    FontChoice("Carlito", "Carlito (Calibri match)", "sans"),
    FontChoice("Inter", "Inter", "sans"),
    FontChoice("Lato", "Lato", "sans"),
    FontChoice("OpenSans", "Open Sans", "sans"),
    FontChoice("NotoSans", "Noto Sans", "sans"),
    FontChoice("Roboto", "Roboto", "sans"),
    FontChoice("WorkSans", "Work Sans", "modern"),
    FontChoice("Montserrat", "Montserrat", "modern"),
    FontChoice("Poppins", "Poppins", "modern"),
    FontChoice("NotoSerif", "Noto Serif", "serif"),
    FontChoice("CrimsonPro", "Crimson Pro", "serif"),
    FontChoice("EBGaramond", "EB Garamond", "serif"),
    FontChoice("RobotoCondensed", "Roboto Condensed", "condensed"),
]
CHOICE_IDS = {c.id for c in CHOICES}

FONT_FILES = {
    name: f"{name}.ttf"
    for base in ["DejaVuSans", "DejaVuSerif", *CHOICE_IDS]
    for name in (base, f"{base}-Bold")
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
