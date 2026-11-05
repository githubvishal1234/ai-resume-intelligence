"""Job-source ingestion boundary (Decision Register D-05, approved 2026-10-22).

Approved sources, each one `JobSourceAdapter`:
- Greenhouse, Lever and Ashby: their official, public job-board APIs, which exist so other sites
  can show a company's postings. Only the one posting the user pasted is requested.
- Any other career page that publishes a schema.org `JobPosting` (the markup Google for Jobs
  reads). Its robots.txt is honoured, and only that one page is read.
Job sites whose terms forbid automated reading (LinkedIn, Indeed, Naukri and similar) are refused
without any request: `blocked_site` names them, and the user is asked to paste the text.
Everything an adapter returns is the posting's own text; the analysis pipeline only consumes
`RawJobContent`, and nothing is filled in when the source does not state it.
"""

from __future__ import annotations

import html
import json
import re
import urllib.robotparser
from abc import ABC, abstractmethod
from dataclasses import dataclass
from html.parser import HTMLParser
from typing import Any
from urllib.parse import parse_qs, quote, urlsplit

from app.jobs.fetch import USER_AGENT, JobExtractionFailed, fetch_text, html_to_text

__all__ = ["JobExtractionFailed", "JobSourceAdapter", "RawJobContent", "blocked_site"]


@dataclass(frozen=True)
class RawJobContent:
    source_id: str
    text: str
    source_url: str | None = None
    title: str | None = None
    company: str | None = None
    location: str | None = None


class JobSourceAdapter(ABC):
    source_id: str
    compliance_note: str  # who approved this source, and on what basis

    @abstractmethod
    def matches(self, url: str) -> bool: ...

    @abstractmethod
    def fetch(self, url: str) -> RawJobContent: ...


# Sites whose terms of use forbid automated reading. Matched on the host and its subdomains.
_BLOCKED = {
    "linkedin.com": "LinkedIn",
    "indeed.com": "Indeed",
    "naukri.com": "Naukri",
    "glassdoor.com": "Glassdoor",
    "glassdoor.co.in": "Glassdoor",
    "monster.com": "Monster",
    "foundit.in": "foundit",
    "ziprecruiter.com": "ZipRecruiter",
}


def _host(url: str) -> str:
    return (urlsplit(url).hostname or "").lower()


def blocked_site(url: str) -> str | None:
    """The site's name when its terms forbid other apps reading its postings."""
    host = _host(url)
    for domain, name in _BLOCKED.items():
        if host == domain or host.endswith("." + domain):
            return name
    # Indeed runs a domain per country (in.indeed.com is covered above; indeed.co.uk is not).
    if re.match(r"^(?:[\w-]+\.)*indeed\.[a-z.]+$", host):
        return "Indeed"
    return None


def _json(url: str) -> Any:
    try:
        return json.loads(fetch_text(url, accept="application/json"))
    except json.JSONDecodeError as exc:
        raise JobExtractionFailed("The job board sent an answer that could not be read.") from exc


def _text(*parts: str | None) -> str:
    return "\n\n".join(p.strip() for p in parts if p and p.strip())


_SLUG = r"[A-Za-z0-9_.-]+"


class GreenhouseAdapter(JobSourceAdapter):
    source_id = "greenhouse"
    compliance_note = "Greenhouse Job Board API: public, documented for showing postings elsewhere."
    _path = re.compile(rf"^/({_SLUG})/jobs/(\d+)")

    def _ids(self, url: str) -> tuple[str, str] | None:
        host, parts = _host(url), urlsplit(url)
        if not (
            host == "boards.greenhouse.io"
            or re.fullmatch(r"job-boards(\.eu)?\.greenhouse\.io", host)
        ):
            return None
        if parts.path.startswith("/embed/job_app"):
            q = parse_qs(parts.query)
            board, token = q.get("for", [""])[0], q.get("token", [""])[0]
            return (board, token) if re.fullmatch(_SLUG, board) and token.isdigit() else None
        m = self._path.match(parts.path)
        return (m.group(1), m.group(2)) if m else None

    def matches(self, url: str) -> bool:
        return self._ids(url) is not None

    def fetch(self, url: str) -> RawJobContent:
        board, job_id = self._ids(url) or ("", "")
        data = _json(f"https://boards-api.greenhouse.io/v1/boards/{quote(board)}/jobs/{job_id}")
        # `content` is HTML that Greenhouse sends entity-escaped.
        body = html_to_text(html.unescape(str(data.get("content") or "")))
        location = (data.get("location") or {}).get("name")
        return RawJobContent(
            self.source_id, body, url, data.get("title"), data.get("company_name"), location
        )


class LeverAdapter(JobSourceAdapter):
    source_id = "lever"
    compliance_note = "Lever Postings API: public, documented for showing postings elsewhere."
    _path = re.compile(rf"^/({_SLUG})/([0-9a-fA-F-]{{36}})")

    def _ids(self, url: str) -> tuple[str, str, str] | None:
        host = _host(url)
        if host not in ("jobs.lever.co", "jobs.eu.lever.co"):
            return None
        m = self._path.match(urlsplit(url).path)
        api = "api.eu.lever.co" if host == "jobs.eu.lever.co" else "api.lever.co"
        return (api, m.group(1), m.group(2)) if m else None

    def matches(self, url: str) -> bool:
        return self._ids(url) is not None

    def fetch(self, url: str) -> RawJobContent:
        api, company, job_id = self._ids(url) or ("", "", "")
        data = _json(f"https://{api}/v0/postings/{quote(company)}/{job_id}")
        lists = [
            _text(item.get("text"), html_to_text(str(item.get("content") or "")))
            for item in data.get("lists") or []
        ]
        body = _text(data.get("descriptionPlain"), *lists, data.get("additionalPlain"))
        location = (data.get("categories") or {}).get("location")
        # Lever's API does not name the company; the URL slug is not a reliable name, so none.
        return RawJobContent(self.source_id, body, url, data.get("text"), None, location)


class AshbyAdapter(JobSourceAdapter):
    source_id = "ashby"
    compliance_note = "Ashby Job Postings API: public, documented for showing postings elsewhere."
    _path = re.compile(rf"^/({_SLUG})/([0-9a-fA-F-]{{36}})")

    def _ids(self, url: str) -> tuple[str, str] | None:
        if _host(url) != "jobs.ashbyhq.com":
            return None
        m = self._path.match(urlsplit(url).path)
        return (m.group(1), m.group(2).lower()) if m else None

    def matches(self, url: str) -> bool:
        return self._ids(url) is not None

    def fetch(self, url: str) -> RawJobContent:
        board, job_id = self._ids(url) or ("", "")
        data = _json(f"https://api.ashbyhq.com/posting-api/job-board/{quote(board)}")
        job = next(
            (j for j in data.get("jobs") or [] if str(j.get("id", "")).lower() == job_id), None
        )
        if job is None:
            raise JobExtractionFailed("That posting is no longer on the company's job board.")
        body = job.get("descriptionPlain") or html_to_text(str(job.get("descriptionHtml") or ""))
        return RawJobContent(self.source_id, body, url, job.get("title"), None, job.get("location"))


class _LdJson(HTMLParser):
    """Collects the contents of <script type="application/ld+json"> blocks."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.blocks: list[str] = []
        self._in = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self._in = (
            tag == "script" and (dict(attrs).get("type") or "").lower() == "application/ld+json"
        )
        if self._in:
            self.blocks.append("")

    def handle_endtag(self, tag: str) -> None:
        self._in = False

    def handle_data(self, data: str) -> None:
        if self._in:
            self.blocks[-1] += data


def find_job_posting(page: str) -> dict[str, Any] | None:
    """The first schema.org JobPosting in the page's JSON-LD, wherever it is nested."""
    parser = _LdJson()
    parser.feed(page)

    def walk(node: Any) -> dict[str, Any] | None:
        if isinstance(node, list):
            return next((hit for n in node if (hit := walk(n))), None)
        if isinstance(node, dict):
            kind = node.get("@type")
            if kind == "JobPosting" or (isinstance(kind, list) and "JobPosting" in kind):
                return node
            return walk(node.get("@graph"))
        return None

    for block in parser.blocks:
        try:
            if hit := walk(json.loads(block)):
                return hit
        except json.JSONDecodeError:
            continue
    return None


def _name(value: Any) -> str | None:
    if isinstance(value, dict):
        value = value.get("name")
    return value.strip() if isinstance(value, str) and value.strip() else None


def _place(value: Any) -> str | None:
    places = value if isinstance(value, list) else [value]
    for place in places:
        address = place.get("address") if isinstance(place, dict) else None
        if isinstance(address, dict):
            parts = [
                _name(address.get(k))
                for k in ("addressLocality", "addressRegion", "addressCountry")
            ]
            if line := ", ".join(dict.fromkeys(p for p in parts if p)):
                return line
    return None


class JsonLdAdapter(JobSourceAdapter):
    """Any https career page with a schema.org JobPosting. Tried last."""

    source_id = "jsonld"
    compliance_note = "Reads one page the user pasted, only where its robots.txt allows."

    def matches(self, url: str) -> bool:
        return urlsplit(url).scheme == "https"

    def _allowed(self, url: str) -> bool:
        parts = urlsplit(url)
        robots = urllib.robotparser.RobotFileParser()
        try:
            robots.parse(
                fetch_text(f"https://{parts.netloc}/robots.txt", accept="text/plain").splitlines()
            )
        except JobExtractionFailed:
            return True  # no robots.txt (or none readable) means no restriction
        return robots.can_fetch(USER_AGENT, url)

    def fetch(self, url: str) -> RawJobContent:
        if not self._allowed(url):
            raise JobExtractionFailed("This site asks automated readers not to open that page.")
        posting = find_job_posting(fetch_text(url))
        if posting is None:
            raise JobExtractionFailed(
                "That page doesn't publish its job details in a form we can read."
            )
        body = html_to_text(html.unescape(str(posting.get("description") or "")))
        return RawJobContent(
            self.source_id,
            body,
            url,
            _name(posting.get("title")),
            _name(posting.get("hiringOrganization")),
            _place(posting.get("jobLocation")),
        )


_ADAPTERS: list[JobSourceAdapter] = [
    GreenhouseAdapter(),
    LeverAdapter(),
    AshbyAdapter(),
    JsonLdAdapter(),
]


def registered_adapters() -> list[JobSourceAdapter]:
    return list(_ADAPTERS)
