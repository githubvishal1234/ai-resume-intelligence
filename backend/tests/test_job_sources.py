from __future__ import annotations

import io
import json
import urllib.error
from email.message import Message
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.jobs import fetch, sources
from app.jobs.fetch import JobExtractionFailed, check_public_https, html_to_text
from app.jobs.sources import blocked_site, find_job_posting

API = "/api/v1/jobs"
DESCRIPTION = (
    "<p>We build payments infrastructure.</p><h3>Requirements</h3><ul>"
    "<li>5+ years of experience with Python and PostgreSQL</li>"
    "<li>Experience designing REST APIs</li></ul>"
    "<h3>Nice to have</h3><ul><li>Kubernetes</li></ul>"
)


def _serve(monkeypatch: pytest.MonkeyPatch, pages: dict[str, Any]) -> list[str]:
    """Stubs the network: each URL returns its page (dicts as JSON); others are 'not found'."""
    seen: list[str] = []

    def fake(url: str, accept: str = "text/html") -> str:
        seen.append(url)
        if url not in pages:
            raise JobExtractionFailed("The site answered with an error (404).")
        page = pages[url]
        return page if isinstance(page, str) else json.dumps(page)

    monkeypatch.setattr(sources, "fetch_text", fake)
    return seen


def test_greenhouse_uses_the_public_board_api(monkeypatch: pytest.MonkeyPatch) -> None:
    api = "https://boards-api.greenhouse.io/v1/boards/acme/jobs/4012345"
    _serve(
        monkeypatch,
        {
            api: {
                "title": "Backend Engineer",
                "company_name": "Acme",
                "location": {"name": "Bengaluru"},
                "content": DESCRIPTION.replace("<", "&lt;").replace(">", "&gt;"),
            }
        },
    )
    for url in (
        "https://boards.greenhouse.io/acme/jobs/4012345",
        "https://job-boards.greenhouse.io/acme/jobs/4012345?gh_src=x",
        "https://boards.greenhouse.io/embed/job_app?for=acme&token=4012345",
    ):
        adapter = next(a for a in sources.registered_adapters() if a.matches(url))
        raw = adapter.fetch(url)
        assert (raw.source_id, raw.title, raw.company, raw.location) == (
            "greenhouse",
            "Backend Engineer",
            "Acme",
            "Bengaluru",
        )
        assert "- 5+ years of experience with Python and PostgreSQL" in raw.text


def test_lever_and_ashby_use_their_posting_apis(monkeypatch: pytest.MonkeyPatch) -> None:
    lever_id = "0f2b6a1c-1d2e-4f3a-9b8c-7d6e5f4a3b2c"
    ashby_id = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"
    _serve(
        monkeypatch,
        {
            f"https://api.lever.co/v0/postings/acme/{lever_id}": {
                "text": "Data Engineer",
                "categories": {"location": "Remote"},
                "descriptionPlain": "Join the data team.",
                "lists": [
                    {"text": "Requirements", "content": "<li>3+ years of SQL</li><li>Airflow</li>"}
                ],
            },
            "https://api.ashbyhq.com/posting-api/job-board/acme": {
                "jobs": [
                    {"id": "other", "title": "Designer", "descriptionPlain": "x"},
                    {
                        "id": ashby_id,
                        "title": "ML Engineer",
                        "location": "London",
                        "descriptionPlain": "Requirements: 4+ years with PyTorch.",
                    },
                ]
            },
        },
    )
    lever = sources.LeverAdapter().fetch(f"https://jobs.lever.co/acme/{lever_id}/apply")
    assert (lever.title, lever.company, lever.location) == ("Data Engineer", None, "Remote")
    assert lever.text == "Join the data team.\n\nRequirements\n\n- 3+ years of SQL\n- Airflow"
    ashby = sources.AshbyAdapter().fetch(f"https://jobs.ashbyhq.com/acme/{ashby_id.upper()}")
    assert (ashby.title, ashby.location) == ("ML Engineer", "London")
    with pytest.raises(JobExtractionFailed, match="no longer"):
        sources.AshbyAdapter().fetch(f"https://jobs.ashbyhq.com/acme/{lever_id}")


def test_career_page_json_ld_is_read_when_robots_allows(monkeypatch: pytest.MonkeyPatch) -> None:
    posting = {
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "Organization", "name": "Ignore me"},
            {
                "@type": "JobPosting",
                "title": "Platform Engineer",
                "description": DESCRIPTION,
                "hiringOrganization": {"@type": "Organization", "name": "Northwind"},
                "jobLocation": [
                    {
                        "@type": "Place",
                        "address": {"addressLocality": "Pune", "addressCountry": {"name": "India"}},
                    }
                ],
            },
        ],
    }
    page = f'<html><script type="application/ld+json">{json.dumps(posting)}</script></html>'
    seen = _serve(
        monkeypatch,
        {
            "https://careers.northwind.example/jobs/42": page,
            "https://careers.northwind.example/robots.txt": "User-agent: *\nDisallow: /private/",
        },
    )
    raw = sources.JsonLdAdapter().fetch("https://careers.northwind.example/jobs/42")
    assert (raw.title, raw.company, raw.location) == (
        "Platform Engineer",
        "Northwind",
        "Pune, India",
    )
    assert seen[0].endswith("/robots.txt")
    with pytest.raises(JobExtractionFailed, match="asks automated readers"):
        sources.JsonLdAdapter().fetch("https://careers.northwind.example/private/1")
    with pytest.raises(JobExtractionFailed, match="form we can read"):
        _serve(monkeypatch, {"https://plain.example/job": "<html><p>No markup</p></html>"})
        sources.JsonLdAdapter().fetch("https://plain.example/job")
    assert find_job_posting('<script type="application/ld+json">{not json</script>') is None


def test_sites_that_forbid_reading_are_named_without_a_request() -> None:
    assert blocked_site("https://www.linkedin.com/jobs/view/1") == "LinkedIn"
    assert blocked_site("https://in.indeed.com/viewjob?jk=1") == "Indeed"
    assert blocked_site("https://uk.indeed.co.uk/viewjob?jk=1") == "Indeed"
    assert blocked_site("https://www.naukri.com/job-listings-1") == "Naukri"
    assert blocked_site("https://notlinkedin.com/jobs") is None
    assert blocked_site("https://boards.greenhouse.io/acme/jobs/1") is None


@pytest.mark.parametrize(
    "url",
    [
        "http://example.com/job",  # not https
        "https://example.com:8443/job",  # non-standard port
        "https://127.0.0.1/job",
        "https://localhost/job",
        "https://10.0.0.5/job",
        "https://169.254.169.254/latest/meta-data",  # cloud metadata
        "https://[::1]/job",
    ],
)
def test_only_public_https_addresses_are_fetched(url: str) -> None:
    with pytest.raises(JobExtractionFailed):
        check_public_https(url)


def test_a_redirect_to_an_internal_address_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    headers = Message()
    headers["location"] = "https://127.0.0.1/admin"
    opened: list[str] = []

    def fake_open(request: Any, timeout: float) -> Any:
        opened.append(request.full_url)
        raise urllib.error.HTTPError(request.full_url, 302, "Found", headers, io.BytesIO())

    monkeypatch.setattr(fetch._opener, "open", fake_open)
    with pytest.raises(JobExtractionFailed, match="not a public website"):
        fetch.fetch("https://93.184.216.34/job")  # a public address literal: no DNS lookup
    assert opened == ["https://93.184.216.34/job"]


def test_html_to_text_keeps_lines_and_list_items() -> None:
    text = html_to_text(
        "<p>Intro &amp; more</p><script>x()</script><ul><li>One</li><li>Two</li></ul>"
    )
    assert text == "Intro & more\n- One\n- Two"


def test_endpoint_saves_and_analyses_a_greenhouse_posting(
    user_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _serve(
        monkeypatch,
        {
            "https://boards-api.greenhouse.io/v1/boards/acme/jobs/7": {
                "title": "Backend Engineer",
                "company_name": "Acme",
                "location": {"name": "Remote"},
                "content": DESCRIPTION,
            }
        },
    )
    url = "https://boards.greenhouse.io/acme/jobs/7"
    response = user_client.post(f"{API}/from-url", json={"url": url})
    assert response.status_code == 201, response.text
    job = response.json()
    assert (job["source"], job["source_url"]) == ("url", url)
    assert (job["title"], job["company"], job["location"]) == ("Backend Engineer", "Acme", "Remote")
    required = [r["text"] for r in job["analysis"]["requirements"] if r["tier"] == "required"]
    assert any("Python and PostgreSQL" in r for r in required)


def test_endpoint_refusals_offer_the_paste_fallback(user_client: TestClient) -> None:
    linkedin = user_client.post(
        f"{API}/from-url", json={"url": "https://www.linkedin.com/jobs/view/1"}
    )
    assert linkedin.status_code == 422
    assert linkedin.json()["code"] == "JOB_SOURCE_NOT_SUPPORTED"
    assert linkedin.json()["message"].startswith("LinkedIn doesn't allow other apps")
    internal = user_client.post(f"{API}/from-url", json={"url": "https://127.0.0.1/jobs/1"})
    assert internal.status_code == 422
    assert internal.json()["code"] == "JOB_SOURCE_NOT_SUPPORTED"
    assert user_client.get(API).json() == []
