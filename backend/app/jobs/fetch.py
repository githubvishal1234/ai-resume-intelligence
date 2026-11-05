"""Guarded HTTP fetching for job links, and HTML-to-text.

A job link is user input, so fetching it is a server-side request on the user's behalf (SSRF).
Every request here:
- uses https only, on the default port;
- resolves the host and refuses any address that is not public (loopback, private, link-local,
  cloud metadata, reserved), and does the same for every redirect hop (at most 3);
- stops after `TIMEOUT_SECONDS` and `MAX_BYTES`.
Nothing here logs page content.
"""

from __future__ import annotations

import ipaddress
import socket
import urllib.error
import urllib.request
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit

from app.core.errors import AppError


class JobExtractionFailed(AppError):
    """Raised instead of ever fabricating job data. Same code as an unsupported site, so the UI
    offers to paste the description; the message says why."""

    status_code = 422
    code = "JOB_SOURCE_NOT_SUPPORTED"
    message = "Unable to extract this job posting. Paste the job description instead."

    def __init__(self, reason: str | None = None) -> None:
        super().__init__(f"{reason} Paste the job description instead." if reason else None)


TIMEOUT_SECONDS = 10
MAX_BYTES = 2 * 1024 * 1024
MAX_REDIRECTS = 3
USER_AGENT = "ResumeIntelligenceJobReader/1.0 (+reads one posting a user pasted)"


def check_public_https(url: str) -> None:
    """Refuses anything but https to a host whose every address is public."""
    parts = urlsplit(url)
    if parts.scheme != "https" or not parts.hostname or parts.port not in (None, 443):
        raise JobExtractionFailed("Only https links on the standard port can be read.")
    try:
        infos = socket.getaddrinfo(parts.hostname, 443, type=socket.SOCK_STREAM)
    except (OSError, UnicodeError) as exc:
        raise JobExtractionFailed("That site could not be found.") from exc
    for info in infos:
        if not ipaddress.ip_address(info[4][0]).is_global:
            raise JobExtractionFailed("That address is not a public website.")
    # ponytail: the address is checked, then urllib resolves it again to connect, so a DNS
    # answer that changes in between (rebinding) is not caught. Pin the IP if that matters.


class _NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args: object, **kwargs: object) -> None:
        return None  # handled in fetch(), so each hop is checked


_opener = urllib.request.build_opener(_NoRedirects)


def fetch(url: str, accept: str = "text/html") -> tuple[bytes, str]:
    """The body (at most MAX_BYTES) and its charset, following up to 3 checked redirects."""
    for _ in range(MAX_REDIRECTS + 1):
        check_public_https(url)
        # https only: check_public_https just refused every other scheme.
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": accept})  # noqa: S310
        try:
            with _opener.open(request, timeout=TIMEOUT_SECONDS) as response:
                body = response.read(MAX_BYTES + 1)
                if len(body) > MAX_BYTES:
                    raise JobExtractionFailed("That page is too large to read.")
                return body, response.headers.get_content_charset() or "utf-8"
        except urllib.error.HTTPError as exc:
            location = (
                exc.headers.get("location") if exc.code in (301, 302, 303, 307, 308) else None
            )
            if not location:
                raise JobExtractionFailed(f"The site answered with an error ({exc.code}).") from exc
            url = urljoin(url, location)
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise JobExtractionFailed("The site could not be reached.") from exc
    raise JobExtractionFailed("That link redirects too many times.")


def fetch_text(url: str, accept: str = "text/html") -> str:
    body, charset = fetch(url, accept)
    return body.decode(charset, errors="replace")


_BLOCK = {"p", "div", "br", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "section"}


class _Text(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.skip = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in ("script", "style"):
            self.skip += 1
        elif tag in _BLOCK:
            self.out.append("\n- " if tag == "li" else "\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style"):
            self.skip = max(0, self.skip - 1)
        elif tag in _BLOCK:
            self.out.append("\n")

    def handle_data(self, data: str) -> None:
        if not self.skip:
            self.out.append(data)


def html_to_text(html: str) -> str:
    """Readable text from posting HTML: one line per block, list items as "- " lines."""
    parser = _Text()
    parser.feed(html)
    return tidy("".join(parser.out))


def tidy(text: str) -> str:
    """Collapses spaces (including non-breaking ones) and drops empty lines."""
    lines = (" ".join(line.split()) for line in text.splitlines())
    return "\n".join(line for line in lines if line and line != "-")
