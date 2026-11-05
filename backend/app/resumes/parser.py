"""Deterministic resume parser: plain text -> `ResumeContent` + a review report.

This is a heuristic parser (section headings, date ranges, bullet markers). It never invents
content: every value it emits is copied from the source text. Its output is always shown to the
user for review before it becomes a master resume, and the report flags low-confidence sections.
An AI-assisted parser can be added behind the same interface once an LLM provider is chosen.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

from app.resumes.content import (
    MAX_BULLETS,
    Certification,
    Contact,
    Education,
    Experience,
    OtherSection,
    Project,
    ResumeContent,
    Skill,
)

PARSER_VERSION = "heuristic-v2"
Confidence = Literal["high", "medium", "low"]
SectionKey = Literal[
    "summary", "experience", "education", "skills", "projects", "certifications", "other"
]

_HEADINGS: dict[str, SectionKey] = {}
for _key, _aliases in {
    "summary": [
        "summary",
        "professional summary",
        "career summary",
        "profile",
        "professional profile",
        "objective",
        "career objective",
        "profile summary",
        "about",
        "about me",
        "overview",
    ],
    "experience": [
        "experience",
        "work experience",
        "professional experience",
        "employment",
        "employment history",
        "work history",
        "career history",
        "relevant experience",
        "internships",
        "internship experience",
    ],
    "education": [
        "education",
        "academic background",
        "academics",
        "education and training",
        "educational background",
        "qualifications",
        "educational qualifications",
        "educational qualification",
        "academic qualifications",
        "academic qualification",
        "academic details",
        "educational details",
    ],
    "skills": [
        "skills",
        "technical skills",
        "core skills",
        "key skills",
        "core competencies",
        "competencies",
        "skills and tools",
        "skill set",
        "skillset",
        "technical skill set",
        "technical expertise",
        "it skills",
        "technologies",
        "tech stack",
        "tools",
        "skills & tools",
        "technical proficiencies",
    ],
    "projects": [
        "projects",
        "personal projects",
        "key projects",
        "selected projects",
        "academic projects",
        "side projects",
    ],
    "certifications": [
        "certifications",
        "certificates",
        "licenses and certifications",
        "licenses & certifications",
        "certifications and licenses",
        "certification",
    ],
    "other": [
        "achievements",
        "awards",
        "honors",
        "honours",
        "awards and honors",
        "publications",
        "languages",
        "volunteer",
        "volunteering",
        "volunteer experience",
        "interests",
        "hobbies",
        "activities",
        "leadership",
        "extracurricular activities",
        "references",
        "declaration",
        "personal details",
        "personal information",
        "languages known",
        "strengths",
    ],
}.items():
    for _alias in _aliases:
        _HEADINGS[_alias] = _key  # type: ignore[assignment]

_MONTH = (
    r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|"
    r"sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?"
)
_DATE = rf"(?:{_MONTH}\s*,?\s*\d{{4}}|\d{{1,2}}\s*/\s*\d{{4}}|\d{{4}}\s*-\s*\d{{2}}|\d{{4}})"
_PRESENT = r"(?:present|current|currently|now|today|ongoing)"
DATE_RANGE = re.compile(
    rf"(?P<start>{_DATE})\s*(?:-{{1,2}}|–|—|to|until)\s*(?P<end>{_DATE}|{_PRESENT})",
    re.IGNORECASE,
)
SINGLE_DATE = re.compile(
    rf"\b(?P<date>{_MONTH}\s*,?\s*\d{{4}}|\d{{1,2}}/\d{{4}}|(?:19|20)\d{{2}})\b", re.IGNORECASE
)
PRESENT_RE = re.compile(rf"^{_PRESENT}$", re.IGNORECASE)
# \ue000-\uf8ff: Word's Symbol and Wingdings bullets reach PDFs as private-use characters.
BULLET = re.compile(r"^\s*(?:[•\-\*▪●◦‣·■□➢➤►✓✔\ue000-\uf8ff]|\d{1,2}[.)])\s+")
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE = re.compile(r"(?<![\w])(\+?\d[\d\s().-]{7,}\d)(?![\w])")
URL = re.compile(
    r"(?:https?://[^\s|,]+|www\.[^\s|,]+|(?:linkedin\.com|github\.com|gitlab\.com)/[^\s|,]+)",
    re.IGNORECASE,
)
SEPARATORS = re.compile(r"\s+(?:\||—|–|-|@|at)\s+|\s*\|\s*|\s*•\s*|\s*·\s*", re.IGNORECASE)
LOCATION = re.compile(
    r"^(?:remote|hybrid|[A-Z][A-Za-z.' -]+,\s*[A-Z][A-Za-z.' -]+)(?:\s*\((?:remote|hybrid)\))?$"
)
INSTITUTION = re.compile(
    r"\b(university|college|institute|school|academy|polytechnic|iit|nit)\b", re.IGNORECASE
)
DEGREE = re.compile(
    r"\b(bachelor|master|doctor|ph\.?\s?d|mba|b\.?\s?s\.?c?|m\.?\s?s\.?c?|b\.?\s?a\.?|m\.?\s?a\.?|"
    r"b\.?\s?tech|m\.?\s?tech|b\.?\s?e\.?|m\.?\s?e\.?|associate|diploma|high school|bca|mca|"
    r"b\.?\s?com|m\.?\s?com|certificate)\b",
    re.IGNORECASE,
)


@dataclass
class SectionReport:
    section: str
    found: bool
    confidence: Confidence
    notes: list[str] = field(default_factory=list)


@dataclass
class ParseResult:
    content: ResumeContent
    sections: list[SectionReport]
    warnings: list[str]
    headings_found: list[str]
    parser_version: str = PARSER_VERSION


# ---- helpers ------------------------------------------------------------------------------
def _norm_heading(line: str) -> str:
    text = re.sub(r"[:\-–—_=*#]+$", "", line.strip()).strip()
    text = text.replace("&", " & ").lower()
    text = re.sub(r"[^a-z& ]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def heading_key(line: str) -> SectionKey | None:
    if not line or len(line) > 50 or BULLET.match(line) or line.rstrip().endswith("."):
        return None
    norm = _norm_heading(line)
    if not norm or len(norm.split()) > 5:
        return None
    if norm in _HEADINGS:
        return _HEADINGS[norm]
    norm_and = norm.replace(" & ", " and ")
    return _HEADINGS.get(norm_and)


# Labels long Indian and US consulting resumes put under each role.
ROLE_NOTE = re.compile(
    r"^(?:project(?:\s+description)?|client|environment|technologies|tech\s+stack|tools)\s*:\s*\S",
    re.IGNORECASE,
)
_ROLE_HEADING = re.compile(
    r"^(?:(?:key\s+|roles?\s*(?:&|and)\s*)?(?:responsibilities|duties)|(?:project\s+)?description|projects?\s+worked(?:\s+on)?)\s*:?$",
    re.IGNORECASE,
)
_JOB_WORD = re.compile(
    r"\b(?:developer|engineer|architect|consultant|manager|lead|analyst|administrator|"
    r"programmer|designer|director|specialist|scientist|intern)\b",
    re.IGNORECASE,
)
_COMPANY_SUFFIX = re.compile(r"^(?:inc|llc|llp|ltd|limited|corp|co|gmbh|plc|pvt)\b", re.IGNORECASE)


# "Project / Client / Role / Duration / Environment": a role written as a block of labels.
_ROLE_LABEL = re.compile(
    r"^(project(?:\s+name)?|client|role|designation|position|duration|period|environment)"
    r"\s*:\s*(.+)$",
    re.IGNORECASE,
)
_PROJECT_NUMBER = re.compile(r"^project\s*(?:#|no\.?)?\s*\d+\s*:?$", re.IGNORECASE)


def _label_blocks_to_roles(lines: list[str]) -> list[str]:
    """Rewrites each label block as the "Role | Client dates" header the parser reads."""
    plain = [_strip_bullet(line) for line in lines]
    found = {m.group(1).lower() for m in map(_ROLE_LABEL.match, plain) if m}
    if not found & {"role", "designation", "position"} or not found & {"duration", "period"}:
        return lines
    out: list[str] = []
    block: dict[str, str] = {}

    def close() -> None:
        if block:
            role = block.get("role") or block.get("designation") or block.get("position", "")
            head = " | ".join(v for v in (role, block.get("client", "")) if v)
            when = block.get("duration") or block.get("period", "")
            out.append(f"{head} {when}".strip())
            name = block.get("project") or block.get("project name")
            out.extend([f"Project: {name}"] if name else [])
            out.extend([f"Environment: {block['environment']}"] if "environment" in block else [])
            block.clear()

    for line, text in zip(lines, plain, strict=True):
        label = _ROLE_LABEL.match(text)
        if _PROJECT_NUMBER.match(text):
            close()
        elif label:
            if label.group(1).lower() in block:
                close()
            block[label.group(1).lower()] = label.group(2).strip()
        elif text or not block:
            close()
            out.append(line)
    close()
    return out


def _lift_skills_table(lines: list[str]) -> tuple[list[str], list[str]]:
    """A PDF can store a skills table in the middle of another section. Returns the lines
    without it, and the table: the longest run of short lines that aren't bullets or prose."""

    def in_table(line: str) -> bool:
        return (
            0 < len(line) <= 80
            and not line.endswith(".")
            and not _is_bullet(line)
            and not _ROLE_LABEL.match(line)
            and not _ROLE_HEADING.match(line)
            and not DATE_RANGE.search(line)
        )

    best = (0, 0)
    start = 0
    for i, line in enumerate([*lines, ""]):
        if in_table(line):
            continue
        if i - start > best[1] - best[0]:
            best = (start, i)
        start = i + 1
    if best[1] - best[0] < 4:
        return lines, []
    return lines[: best[0]] + lines[best[1] :], lines[best[0] : best[1]]


def _split_header(pieces: list[str], location: str) -> tuple[str, str, str]:
    """(title, company, location), for headers joined by commas as well as separators."""
    if len(pieces) == 1 and "," in pieces[0]:
        parts = [p.strip() for p in pieces[0].split(",") if p.strip()]
        if _JOB_WORD.search(parts[0]) and not _JOB_WORD.search(parts[1]):
            return parts[0], parts[1], location or ", ".join(parts[2:])
    if len(pieces) >= 2 and "," in pieces[1] and not location:
        company, _, place = pieces[1].partition(",")
        if not _COMPANY_SUFFIX.match(place.strip()):
            return pieces[0], company.strip(), place.strip()
    return (pieces[0] if pieces else ""), (pieces[1] if len(pieces) > 1 else ""), location


def _employer_only(header: str, body: list[str]) -> tuple[str, str] | None:
    """(company, location) for an employer line with its client roles listed under it."""
    if body or _JOB_WORD.search(header):
        return None
    company, _, place = re.sub(r"[/\s]*\(\s*\)", "", URL.sub("", header)).partition(",")
    return company.strip(" /("), place.strip(" ,")


def _strip_bullet(line: str) -> str:
    return BULLET.sub("", line, count=1).strip()


def _is_bullet(line: str) -> bool:
    return bool(BULLET.match(line))


def _find_range(text: str) -> tuple[str, str, bool, str]:
    """Returns (start, end, current, text_without_range)."""
    match = DATE_RANGE.search(text)
    if not match:
        return "", "", False, text
    start, end = match.group("start").strip(), match.group("end").strip()
    current = bool(PRESENT_RE.match(end))
    rest = (text[: match.start()] + " " + text[match.end() :]).strip(" ,|–—-()\t")
    return start, end, current, re.sub(r"\s{2,}", " ", rest)


def _trim(piece: str) -> str:
    """Drops stray brackets, keeping balanced ones: "Developer (Angular / .NET)"."""
    piece = piece.strip(" ,;")
    if piece.startswith("(") and piece.endswith(")"):
        return piece[1:-1].strip()
    return piece.strip(" ,;()") if piece.count("(") != piece.count(")") else piece


def _pieces(text: str) -> list[str]:
    return [t for t in (_trim(p) for p in SEPARATORS.split(text) if p) if t]


def _looks_like_header(line: str) -> bool:
    words = line.split()
    limit = 18 if DATE_RANGE.search(line) else 12  # dates and separators count as words here
    return 0 < len(words) <= limit and not line.rstrip().endswith(".")


# ---- section parsers ---------------------------------------------------------------------
def parse_contact(lines: list[str]) -> tuple[Contact, list[str]]:
    """Returns the contact block and any leftover lines (e.g. an unlabeled summary)."""
    contact = Contact()
    leftovers: list[str] = []
    links: list[str] = []
    for line in lines:
        consumed = False
        for email in EMAIL.findall(line):
            contact.email = contact.email or email
            consumed = True
        for url in URL.findall(line):
            if "@" not in url and url not in links:
                links.append(url.rstrip(".)"))
                consumed = True
        phone = PHONE.search(EMAIL.sub("", line))
        if phone and len(re.sub(r"\D", "", phone.group(1))) >= 8:
            contact.phone = contact.phone or phone.group(1).strip()
            consumed = True
        if consumed:
            for piece in _pieces(URL.sub("", EMAIL.sub("", PHONE.sub("", line)))):
                if not contact.location and LOCATION.match(piece):
                    contact.location = piece
            continue
        if not contact.full_name and _looks_like_name(line):
            contact.full_name = line.strip()
            continue
        if not contact.location and len(line) < 60 and LOCATION.match(line.strip()):
            contact.location = line.strip()
            continue
        leftovers.append(line)
    contact.links = links[:10]
    return contact, leftovers


def _is_contact_line(line: str) -> bool:
    """A line of only contact details ("Hyderabad, Telangana | 96523 59002 | me@x.com").

    Two-column PDFs often put it after the last section; it belongs in Contact wherever it is.
    """
    phone = PHONE.search(EMAIL.sub("", line))
    has_phone = bool(phone and len(re.sub(r"\D", "", phone.group(1))) >= 10)
    if len(line) > 160 or not (EMAIL.search(line) or has_phone):
        return False
    rest = _pieces(URL.sub("", EMAIL.sub("", PHONE.sub("", line))))
    return all(LOCATION.match(p) or len(p) <= 3 for p in rest)


def _looks_like_name(line: str) -> bool:
    words = line.strip().split()
    if not 1 < len(words) <= 5 or any(ch.isdigit() for ch in line):
        return False
    return all(re.match(r"^[A-Za-zÀ-ÿ'’.\-]+$", w) for w in words)


def _group_entries(
    lines: list[str], *, starts_entry: re.Pattern[str] | None = None
) -> list[tuple[list[str], list[str]]]:
    """Groups section lines into (header_lines, body_lines) entries."""
    entries: list[tuple[list[str], list[str]]] = []
    header: list[str] = []
    body: list[str] = []

    def flush() -> None:
        nonlocal header, body
        if header or body:
            entries.append((header, body))
        header, body = [], []

    for index, line in enumerate(lines):
        if not line or _ROLE_HEADING.match(line):
            continue
        if _is_bullet(line):
            body.append(_strip_bullet(line))
            continue
        if ROLE_NOTE.match(line):
            body.append(re.sub(r"\s*:\s*", ": ", line, count=1))
            continue
        upcoming = [ln for ln in lines[index + 1 : index + 3] if ln]
        signals_new = (
            bool(DATE_RANGE.search(line))
            or bool(starts_entry and starts_entry.search(line))
            or any(DATE_RANGE.search(u) and not _is_bullet(u) for u in upcoming[:1])
        )
        if body:
            dated_soon = any(DATE_RANGE.search(u) for u in upcoming)
            continues_bullet = body[-1].endswith((",", "and", "&"))
            if _looks_like_header(line) and (signals_new or (dated_soon and not continues_bullet)):
                flush()
                header.append(line)
            else:
                body[-1] = f"{body[-1]} {line}".strip()  # wrapped bullet text
            continue
        if header and len(header) >= 3 and not signals_new:
            body.append(line)  # unmarked description paragraph
            continue
        if header and signals_new and any(DATE_RANGE.search(h) for h in header):
            flush()
        header.append(line)
    flush()
    return entries


def parse_experience(lines: list[str]) -> tuple[list[Experience], SectionReport]:
    report = SectionReport("experience", True, "high")
    items: list[Experience] = []
    for header, body in _group_entries(_label_blocks_to_roles(lines)):
        joined = " | ".join(header)
        start, end, current, rest = _find_range(joined)
        pieces = _pieces(rest)
        location = next((p for p in pieces if LOCATION.match(p)), "")
        pieces = [p for p in pieces if p != location]
        title, company, location = _split_header(pieces, location)
        bullets = [b for b in body if b]
        if len(bullets) > MAX_BULLETS:
            report.confidence = "medium"
            report.notes.append(
                f"{title or 'One role'} has {len(bullets)} bullets; "
                f"the first {MAX_BULLETS} were kept."
            )
        if start and not company and (employer := _employer_only(rest, bullets)):
            title, company, location = "", *employer
        if not header and items:  # stray bullets: attach to the previous role
            items[-1].bullets.extend(bullets)
            continue
        items.append(
            Experience(
                title=title[:200],
                company=company[:200],
                location=location[:200],
                start_date=start,
                end_date=end,
                current=current,
                bullets=[b[:1000] for b in bullets][:MAX_BULLETS],
            )
        )
    if not items:
        return [], SectionReport("experience", True, "low", ["No roles could be identified."])
    undated = sum(1 for i in items if not i.start_date)
    no_company = sum(1 for i in items if not i.company)
    if undated == len(items):
        report.confidence = "low"
        report.notes.append("No date ranges were found; check each role's dates.")
    elif undated or no_company:
        report.confidence = "medium"
        if undated:
            report.notes.append(f"{undated} role(s) have no dates.")
        if no_company:
            report.notes.append(
                f"{no_company} role(s) have no company; title and company may be swapped or merged."
            )
    return items, report


_FIELD_WORD = re.compile(
    r"\b(?:Engineering|Sciences?|Technology|Commerce|Arts|Applications|Studies|Management)\b"
)
_FIELD_THEN_SCHOOL = re.compile(
    rf"^(.*{_FIELD_WORD.pattern})\s+"
    r"(.*\b[A-Z]\S*\s+(?:University|College|Institute|School|Academy)\b.*)$"
)


def _degree_first(piece: str) -> list[str]:
    """Splits "Master of Science, Some University, India" before the institution, and
    "Civil Engineering Andhra University" between the subject and the institution."""
    both = _FIELD_THEN_SCHOOL.match(piece)
    if both and not INSTITUTION.search(both.group(1)):
        return [both.group(1), both.group(2)]
    parts = piece.split(",")
    at = next((i for i, p in enumerate(parts) if INSTITUTION.search(p)), 0)
    return [",".join(parts[:at]).strip(), ",".join(parts[at:]).strip()] if at else [piece]


def parse_education(lines: list[str]) -> tuple[list[Education], SectionReport]:
    report = SectionReport("education", True, "high")
    items: list[Education] = []
    current: Education | None = None
    rows: list[str] = []
    for raw in (ln for ln in lines if ln):
        wrapped = (
            rows
            and _is_bullet(rows[-1])
            and not _is_bullet(raw)
            and len(raw.split()) <= 4
            and not (INSTITUTION.search(raw) or DEGREE.search(raw))
            and not SINGLE_DATE.search(rows[-1])
        )
        if wrapped:
            rows[-1] = f"{rows[-1]} {raw}"  # "... Andhra" / "Pradesh - 2021"
        else:
            rows.append(raw)
    for raw in rows:
        line = _strip_bullet(raw)
        start, end, _, rest = _find_range(line)
        if not start:
            single = SINGLE_DATE.search(line)
            if single and len(line.split()) <= 4:
                rest = ""
                end = single.group("date")
            elif single:
                end = single.group("date")
                rest = (line[: single.start()] + line[single.end() :]).strip(" ,|–—-()")
        is_institution = bool(INSTITUTION.search(rest))
        is_degree = bool(DEGREE.search(rest)) and not is_institution
        new_entry = (
            current is None
            or (is_institution and current.institution)
            or (is_degree and current.degree)
        )
        if new_entry and (is_institution or is_degree or current is None):
            current = Education()
            items.append(current)
        assert current is not None
        if start or end:
            current.start_date = current.start_date or start
            current.end_date = current.end_date or end
        for piece in [d for p in _pieces(rest) for d in _degree_first(p)] if rest else []:
            if INSTITUTION.search(piece) and not current.institution:
                current.institution = piece[:200]
            elif DEGREE.search(piece) and not current.degree:
                parts = re.split(r"\s+in\s+", piece, maxsplit=1)
                current.degree = parts[0][:200]
                if len(parts) > 1:
                    current.field_of_study = parts[1][:200]
            elif current.degree and not current.field_of_study and _FIELD_WORD.search(piece):
                current.field_of_study = piece[:200]
            elif not LOCATION.match(piece):
                current.details.append(piece[:1000])
    items = [i for i in items if i.institution or i.degree or i.details]
    if not items:
        return [], SectionReport("education", True, "low", ["No education entries recognized."])
    if any(not i.institution for i in items):
        report.confidence = "medium"
        report.notes.append("Some entries have no institution.")
    return items, report


# "Cloud Platforms AWS, GCP": a skills table loses its column break in a PDF.
_CATEGORY_WORD = (
    r"(?:languages?|frameworks?|technologies|frontend|front-end|backend|back-end|tools|"
    r"platforms?|servers?|systems?|databases?|services|libraries|management|integration|"
    r"security)"
)
_SKILL_CATEGORY = re.compile(
    rf"^((?:[A-Za-z0-9/&+\-]+\s+){{0,2}}?{_CATEGORY_WORD}(?:\s+{_CATEGORY_WORD})?"
    r"(?:\s*(?:and|&)\s*[A-Za-z0-9/+\-]+)?)\s+(\S.*,.*)$",
    re.IGNORECASE,
)
_CATEGORY_LINE = re.compile(rf"^{_CATEGORY_WORD}$", re.IGNORECASE)
_CATEGORY_NEXT = re.compile(rf"^{_CATEGORY_WORD}\b", re.IGNORECASE)


def _table_rows(lines: list[str]) -> list[str]:
    """Puts table rows back together: "Frontend" / "Technologies" / "Angular, CSS" is one row,
    and so is a row wrapped after a comma or inside brackets."""
    rows: list[str] = []
    lead = ""
    for i, raw in enumerate(lines):
        line = _strip_bullet(raw)
        last = rows[-1] if rows else ""
        if not lead and (last.endswith(",") or last.count("(") > last.count(")")):
            rows[-1] = f"{last} {line}"
            continue
        after = lines[i + 1] if i + 1 < len(lines) else ""
        if (
            after
            and not {",", ":"} & set(line)
            and (
                _CATEGORY_LINE.match(line)
                or (len(line.split()) == 1 and _CATEGORY_NEXT.match(after))
            )
        ):
            lead += f"{line} "
            continue
        rows.append(lead + line)
        lead = ""
    return rows + ([lead.strip()] if lead else [])


_SKILL_SPLIT = re.compile(r"\s*(?:,|;|\||•|·|•|\s{2,}|\t)\s*")


def parse_skills(lines: list[str]) -> tuple[list[Skill], SectionReport]:
    skills: list[Skill] = []
    seen: set[str] = set()
    for line in _table_rows([ln for ln in lines if ln]):
        category = ""
        match = re.match(r"^([A-Za-z][A-Za-z &/+\-]{1,40}):\s*(.+)$", line)
        match = match or _SKILL_CATEGORY.match(line)
        if match:
            category, line = match.group(1).strip(), match.group(2)
        # "AWS (EC2, S3, RDS)": the parts are skills too, not "AWS (EC2".
        line = re.sub(r"\(([^()]*,[^()]*)\)", r", \1", line)
        for item in _SKILL_SPLIT.split(line):
            name = item.strip(" .")
            if not name or len(name) > 60 or len(name.split()) > 5:
                continue
            key = name.lower()
            if key in seen:
                continue
            seen.add(key)
            skills.append(Skill(name=name, category=category[:200]))
    report = SectionReport("skills", True, "high" if len(skills) >= 5 else "medium")
    if not skills:
        report.confidence = "low"
        report.notes.append("No skills were recognized.")
    elif len(skills) < 5:
        report.notes.append("Only a few skills were found; check that none were merged.")
    return skills[:200], report


def parse_projects(lines: list[str]) -> tuple[list[Project], SectionReport]:
    items: list[Project] = []
    current: Project | None = None
    for raw in (ln for ln in lines if ln):
        tech = re.match(
            r"^(?:tech(?:nologies)?|stack|tools|built with)\s*[:\-]\s*(.+)$",
            _strip_bullet(raw),
            re.IGNORECASE,
        )
        if tech and current is not None:
            current.technologies.extend(t for t in _SKILL_SPLIT.split(tech.group(1)) if t)
            continue
        if _is_bullet(raw) and current is not None:
            current.bullets.append(_strip_bullet(raw)[:1000])
            continue
        if (
            current is not None
            and (current.bullets or current.description)
            and not (_looks_like_header(raw))
        ):
            if current.bullets:
                current.bullets[-1] = f"{current.bullets[-1]} {raw}"[:1000]
            else:
                current.description = f"{current.description} {raw}"[:5000]
            continue
        if (
            current is not None
            and not current.bullets
            and not current.description
            and not (_looks_like_header(raw))
        ):
            current.description = raw[:5000]
            continue
        url = URL.search(raw)
        text = URL.sub("", raw).strip(" |–—-")
        parts = re.split(r"\s+[|–—-]\s+|\s*\|\s*", text, maxsplit=1)
        current = Project(name=parts[0][:200], url=url.group(0)[:500] if url else "")
        if len(parts) > 1:
            # "Name | Python, FastAPI" lists technologies; "Name – AI Voice Receptionist" is a
            # tagline, which describes the project.
            listed = [t for t in _SKILL_SPLIT.split(parts[1]) if t]
            if len(listed) > 1:
                current.technologies = listed[:40]
            else:
                current.description = parts[1][:5000]
        items.append(current)
    report = SectionReport("projects", True, "high" if items else "low")
    if not items:
        report.notes.append("No projects recognized.")
    return items[:50], report


def parse_certifications(lines: list[str]) -> tuple[list[Certification], SectionReport]:
    items: list[Certification] = []
    for raw in (ln for ln in lines if ln):
        line = _strip_bullet(raw)
        date_match = SINGLE_DATE.search(line)
        date = date_match.group("date") if date_match else ""
        rest = (line[: date_match.start()] + line[date_match.end() :]) if date_match else line
        rest = rest.strip(" ,|–—-()")
        # Split on commas/pipes first: dashes often belong to the name ("... – Associate").
        pieces = [p.strip() for p in re.split(r"\s*[,|]\s*", rest) if p.strip()]
        if len(pieces) == 1 and " — " in rest:
            pieces = [p.strip() for p in rest.split(" — ", 1)]
        if not pieces:
            continue
        items.append(
            Certification(
                name=pieces[0][:200], issuer=(pieces[1] if len(pieces) > 1 else "")[:200], date=date
            )
        )
    report = SectionReport("certifications", True, "high" if items else "low")
    return items[:50], report


# ---- top level ---------------------------------------------------------------------------
def split_sections(text: str) -> tuple[list[str], list[tuple[str, SectionKey, list[str]]]]:
    lines = [ln.strip() for ln in text.rstrip().split("\n")]
    if lines[-1].lower().rstrip(":.") == "signature":
        lines = "\n".join(lines[:-1]).rstrip().split("\n")[:-1]  # the signed name goes too
    header: list[str] = []
    sections: list[tuple[str, SectionKey, list[str]]] = []
    previous = ""
    for line in lines:
        # "Frontend" / "Technologies" in a skills table isn't the Technologies heading.
        key = None if _CATEGORY_LINE.match(previous) else heading_key(line)
        previous = line or previous
        if key:
            sections.append((line.strip().rstrip(":"), key, []))
        elif sections:
            sections[-1][2].append(line)
        else:
            header.append(line)
    return header, sections


def parse_resume(text: str) -> ParseResult:
    header, sections = split_sections(text)
    # Contact lines that landed inside a section move to the header block.
    moved = [ln for _, _, body in sections for ln in body if ln and _is_contact_line(ln)]
    sections = [(h, k, [ln for ln in body if ln not in moved]) for h, k, body in sections]
    if not any(any(body) for _, k, body in sections if k == "skills"):
        for i, (h, k, body) in enumerate(sections):
            rest, table = _lift_skills_table(body) if k == "experience" else (body, [])
            if table:
                sections[i] = (h, k, rest)
                empty = next((j for j, sec in enumerate(sections) if sec[1] == "skills"), None)
                if empty is None:
                    sections.append(("Skills", "skills", table))
                else:
                    sections[empty] = (sections[empty][0], "skills", table)
                break
    contact, leftovers = parse_contact([ln for ln in header if ln] + moved)
    # A short line under the name ("GenAI Engineer | AI Engineer") is a headline, not summary.
    if (
        leftovers
        and (len(leftovers[0]) <= 80 or ("|" in leftovers[0] and len(leftovers[0]) <= 200))
        and not leftovers[0].rstrip().endswith(".")
    ):
        contact.headline = _strip_bullet(leftovers.pop(0))[:200]
    content = ResumeContent(contact=contact)
    reports: dict[str, SectionReport] = {}
    warnings: list[str] = []

    contact_conf: Confidence = (
        "high"
        if contact.full_name and contact.email
        else "medium"
        if contact.full_name or contact.email
        else "low"
    )
    reports["contact"] = SectionReport(
        "contact", bool(contact.full_name or contact.email), contact_conf
    )
    if not contact.email:
        reports["contact"].notes.append("No email address found.")

    summary_lines: list[str] = []
    if leftovers and not sections:
        warnings.append(
            "No section headings were recognized. The text was kept under "
            "'Unsorted' so nothing is lost; please organize it before saving."
        )
        content.other.append(
            OtherSection(heading="Unsorted", lines=[ln[:1000] for ln in leftovers][:50])
        )
    elif leftovers:
        summary_lines.extend(leftovers)  # unlabeled paragraph under the name = summary

    for heading, key, body in sections:
        if key == "summary":
            summary_lines.extend(ln for ln in body if ln)
        elif key == "experience":
            items, rep = parse_experience(body)
            content.experience.extend(items)
            reports.setdefault("experience", rep)
        elif key == "education":
            edu, rep = parse_education(body)
            content.education.extend(edu)
            reports.setdefault("education", rep)
        elif key == "skills":
            skills, rep = parse_skills(body)
            known = {s.name.lower() for s in content.skills}
            content.skills.extend(s for s in skills if s.name.lower() not in known)
            reports.setdefault("skills", rep)
        elif key == "projects":
            projects, rep = parse_projects(body)
            content.projects.extend(projects)
            reports.setdefault("projects", rep)
        elif key == "certifications":
            certs, rep = parse_certifications(body)
            content.certifications.extend(certs)
            reports.setdefault("certifications", rep)
        else:
            lines = [_strip_bullet(ln)[:1000] for ln in body if ln]
            if lines:
                content.other.append(OtherSection(heading=heading[:200], lines=lines[:50]))

    if summary_lines:
        content.summary = " ".join(_strip_bullet(ln) for ln in summary_lines)[:5000]
        reports["summary"] = SectionReport("summary", True, "high")

    for key in ("summary", "experience", "education", "skills"):
        if key not in reports:
            reports[key] = SectionReport(key, False, "low", ["Section not found."])

    ordered = [
        "contact",
        "summary",
        "experience",
        "education",
        "skills",
        "projects",
        "certifications",
    ]
    section_reports = [reports[k] for k in ordered if k in reports]
    return ParseResult(
        content=content,
        sections=section_reports,
        warnings=warnings,
        headings_found=[h for h, _, _ in sections],
    )
