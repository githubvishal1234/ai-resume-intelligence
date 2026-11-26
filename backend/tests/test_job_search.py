"""Live job search for a resume (Adzuna): query, ranking by evidence, errors and ownership."""

from __future__ import annotations

import io
import json
import urllib.error
import urllib.parse
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.core.config import Settings, get_settings
from app.jobsearch import adzuna
from app.jobsearch.ranking import default_query, rank
from app.main import create_app
from app.resumes.content import ResumeContent
from app.resumes.parser import parse_resume
from tests.conftest import login_as, register
from tests.fixtures import SAMPLE_TEXT
from tests.test_resumes import import_and_confirm

RESULTS: dict[str, Any] = {
    "count": 2,
    "results": [
        {
            "id": "1",
            "title": "Data Analyst",
            "description": "Excel and Tableau reporting.",
            "redirect_url": "https://www.adzuna.in/land/ad/1",
            "company": {"display_name": "Northwind"},
            "location": {"display_name": "Bengaluru, Karnataka"},
        },
        {
            "id": "2",
            "title": "Backend <strong>Engineer</strong>",
            "description": "Python, PostgreSQL and Kubernetes on AWS.",
            "redirect_url": "https://www.adzuna.in/land/ad/2",
            "created": "2026-11-20T10:00:00Z",
            "salary_min": 2000000,
            "company": {"display_name": "Acme"},
        },
        {"id": "3", "title": "No link", "redirect_url": "javascript:alert(1)"},
    ],
}


class _Response(io.BytesIO):
    def __enter__(self) -> _Response:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()


@pytest.fixture
def calls(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    seen: list[str] = []

    def fake_urlopen(request: Any, timeout: float) -> _Response:
        seen.append(request.full_url)
        return _Response(json.dumps(RESULTS).encode())

    monkeypatch.setattr(adzuna.urllib.request, "urlopen", fake_urlopen)
    return seen


@pytest.fixture
def search_settings() -> Settings:
    return get_settings().model_copy(
        update={"adzuna_app_id": "app-1", "adzuna_app_key": SecretStr("key-secret-1")}
    )


@pytest.fixture
def search_client(search_settings: Settings) -> TestClient:
    application = create_app(search_settings)
    application.dependency_overrides[get_settings] = lambda: search_settings
    client = TestClient(application, raise_server_exceptions=False)
    response = register(client)
    client.headers["x-csrf-token"] = response.json()["csrf_token"]
    return client


def _content() -> ResumeContent:
    return parse_resume(SAMPLE_TEXT).content


def test_default_query_uses_latest_title_and_city() -> None:
    assert default_query(_content()) == ("Senior Software Engineer", "Bengaluru")


def test_parse_skips_unsafe_links_and_strips_tags() -> None:
    page = adzuna.parse(RESULTS)
    assert [item.id for item in page.listings] == ["1", "2"]
    assert page.listings[1].title == "Backend Engineer"
    assert page.total == 2


def test_rank_puts_backed_up_skills_first() -> None:
    ranked = rank(adzuna.parse(RESULTS).listings, _content())
    assert ranked[0].listing.id == "2"
    assert "Python" in ranked[0].shown and "PostgreSQL" in ranked[0].shown
    assert "AWS" in ranked[0].missing


def test_search_for_a_resume(search_client: TestClient, calls: list[str]) -> None:
    resume = import_and_confirm(search_client)
    response = search_client.get(f"/api/v1/resumes/{resume['id']}/jobs")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["query"] == {"what": "Senior Software Engineer", "where": "Bengaluru"}
    assert body["attribution_url"] == "https://www.adzuna.in"
    assert body["country"] == "in"
    assert [r["id"] for r in body["results"]] == ["2", "1"]
    query = urllib.parse.parse_qs(urllib.parse.urlsplit(calls[0]).query)
    assert calls[0].startswith("https://api.adzuna.com/v1/api/jobs/in/search/1?")
    assert query["what"] == ["Senior Software Engineer"] and query["where"] == ["Bengaluru"]


def test_query_can_be_changed(search_client: TestClient, calls: list[str]) -> None:
    resume = import_and_confirm(search_client)
    response = search_client.get(
        f"/api/v1/resumes/{resume['id']}/jobs",
        params={"what": "data engineer", "where": "", "page": 2},
    )
    assert response.status_code == 200
    assert "/search/2?" in calls[0] and "where=" not in calls[0]
    blank = search_client.get(f"/api/v1/resumes/{resume['id']}/jobs", params={"what": " "})
    assert blank.status_code == 422 and blank.json()["code"] == "JOB_SEARCH_NO_QUERY"


def test_not_configured(user_client: TestClient) -> None:
    resume = import_and_confirm(user_client)
    response = user_client.get(f"/api/v1/resumes/{resume['id']}/jobs")
    assert response.status_code == 503
    assert response.json()["code"] == "JOB_SEARCH_NOT_CONFIGURED"
    caps = user_client.get("/api/v1/system/capabilities").json()
    assert caps["job_search"] == {"configured": False, "provider": None}


def test_provider_error_never_leaks_the_key(
    search_client: TestClient, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    def failing(request: Any, timeout: float) -> None:
        raise urllib.error.HTTPError(request.full_url, 401, "Unauthorized", None, None)  # type: ignore[arg-type]

    monkeypatch.setattr(adzuna.urllib.request, "urlopen", failing)
    resume = import_and_confirm(search_client)
    response = search_client.get(f"/api/v1/resumes/{resume['id']}/jobs")
    assert response.status_code == 502 and response.json()["code"] == "JOB_SEARCH_FAILED"
    assert "key-secret-1" not in response.text and "key-secret-1" not in caplog.text


def test_another_users_resume_is_not_found(search_client: TestClient, calls: list[str]) -> None:
    resume = import_and_confirm(search_client)
    other = login_as(search_client.app, "eve@example.com")
    assert other.get(f"/api/v1/resumes/{resume['id']}/jobs").status_code == 404
    assert calls == []
