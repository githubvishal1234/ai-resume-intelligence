"""Live job openings from the Adzuna search API (https://developer.adzuna.com).

One GET per search, standard library only (no SDK). The request URL carries the API key in
its query string, so nothing here logs or raises with the URL; errors carry the HTTP status
only. Adzuna returns a snippet of each description, never the whole posting.

Terms that bind the product (https://developer.adzuna.com/docs/terms_of_service): every
listing shown must be labelled "Adzuna" (at least 116 x 23 px) and link to Adzuna's local
site, and use in a product that earns revenue needs a licence after a 14-day trial.
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime

from app.core.config import Settings
from app.core.errors import AppError
from app.jobs.fetch import html_to_text

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 15
RESULTS_PER_PAGE = 20
USER_AGENT = "ResumeIntelligence/1.0"
# Adzuna's site per country, for the attribution link; other countries use the .com site.
_SITES = {
    "gb": "https://www.adzuna.co.uk",
    "in": "https://www.adzuna.in",
    "us": "https://www.adzuna.com",
}


class JobSearchNotConfigured(AppError):
    status_code = 503
    code = "JOB_SEARCH_NOT_CONFIGURED"
    message = "Live job search is not set up on this deployment."


class JobSearchFailed(AppError):
    status_code = 502
    code = "JOB_SEARCH_FAILED"
    message = "The job search service did not answer. Please try again in a minute."


@dataclass(frozen=True)
class Listing:
    id: str
    title: str
    company: str | None
    location: str | None
    description: str
    url: str
    created: datetime | None
    salary_min: float | None
    salary_max: float | None
    contract_time: str | None


@dataclass(frozen=True)
class Page:
    total: int
    listings: list[Listing]


def configured(settings: Settings) -> bool:
    return bool(settings.adzuna_app_id and settings.adzuna_app_key)


def site_url(settings: Settings) -> str:
    return _SITES.get(settings.adzuna_country, "https://www.adzuna.com")


def _text(value: object) -> str | None:
    return value.strip() or None if isinstance(value, str) else None


def _number(value: object) -> float | None:
    return float(value) if isinstance(value, int | float) and not isinstance(value, bool) else None


def _when(value: object) -> datetime | None:
    try:
        return (
            datetime.fromisoformat(value.replace("Z", "+00:00")) if isinstance(value, str) else None
        )
    except ValueError:
        return None


def _named(value: object) -> str | None:
    return _text(value.get("display_name")) if isinstance(value, dict) else None


def parse(payload: object) -> Page:
    """Listings from Adzuna's JSON; entries without an id, a title or a web link are skipped."""
    data = payload if isinstance(payload, dict) else {}
    listings: list[Listing] = []
    for raw in data.get("results") or []:
        if not isinstance(raw, dict):
            continue
        url = _text(raw.get("redirect_url")) or ""
        title = _text(raw.get("title"))
        if (
            not title
            or raw.get("id") is None
            or urllib.parse.urlsplit(url).scheme not in ("http", "https")
        ):
            continue
        listings.append(
            Listing(
                id=str(raw["id"]),
                title=html_to_text(title),
                company=_named(raw.get("company")),
                location=_named(raw.get("location")),
                description=html_to_text(_text(raw.get("description")) or ""),
                url=url,
                created=_when(raw.get("created")),
                salary_min=_number(raw.get("salary_min")),
                salary_max=_number(raw.get("salary_max")),
                contract_time=_text(raw.get("contract_time")),
            )
        )
    total = data.get("count")
    return Page(total=total if isinstance(total, int) else len(listings), listings=listings)


def search(settings: Settings, what: str, where: str, page: int) -> Page:
    if not configured(settings) or settings.adzuna_app_key is None:
        raise JobSearchNotConfigured()
    query = {
        "app_id": settings.adzuna_app_id,
        "app_key": settings.adzuna_app_key.get_secret_value(),
        "results_per_page": RESULTS_PER_PAGE,
        "what": what,
        "content-type": "application/json",
    }
    if where:
        query["where"] = where
    country = urllib.parse.quote(settings.adzuna_country, safe="")
    base = settings.adzuna_api_base.rstrip("/")
    url = f"{base}/jobs/{country}/search/{page}?{urllib.parse.urlencode(query)}"
    # The base URL is configuration (https enforced in production), never user input.
    request = urllib.request.Request(  # noqa: S310
        url, headers={"Accept": "application/json", "User-Agent": USER_AGENT}
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310
            return parse(json.loads(response.read()))
    except urllib.error.HTTPError as exc:
        logger.warning("job_search_failed", extra={"status": exc.code})
        raise JobSearchFailed() from None
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        logger.warning("job_search_failed", extra={"status": None})
        raise JobSearchFailed() from None
