from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.conftest import login_as
from tests.test_jobs import create as create_job
from tests.test_resumes import import_and_confirm

API = "/api/v1/search"


def _kinds(client: TestClient, q: str) -> dict[str, list[str]]:
    r = client.get(API, params={"q": q})
    assert r.status_code == 200, r.text
    out: dict[str, list[str]] = {}
    for h in r.json()["hits"]:
        out.setdefault(h["kind"], []).append(h["title"])
    return out


def test_finds_each_kind_case_insensitively(user_client: TestClient) -> None:
    import_and_confirm(user_client)
    job = create_job(user_client, company="Northwind").json()
    user_client.post("/api/v1/applications", json={"job_id": job["id"]})
    user_client.post("/api/v1/cover-letters", json={"job_id": job["id"]})
    user_client.post("/api/v1/proofs", json={"skill": "Rust"})  # not in the sample resume

    hits = _kinds(user_client, "northwind")
    assert set(hits) == {"job", "application", "cover_letter"}
    assert _kinds(user_client, "RUST") == {"proof": ["Build a small tool in Rust"]}


def test_resumes_match_on_their_content(user_client: TestClient) -> None:
    master = import_and_confirm(user_client)
    hits = _kinds(user_client, "Acme Analytics")  # a company in the sample resume's experience
    assert hits.get("resume") == [master["title"]]


def test_like_wildcards_are_literal(user_client: TestClient) -> None:
    create_job(user_client, company="Northwind")
    assert _kinds(user_client, "%%") == {}
    assert _kinds(user_client, "__") == {}


def test_only_own_data_and_validation(app: FastAPI, user_client: TestClient) -> None:
    create_job(user_client, company="Northwind")
    other = login_as(app, "other@example.com")
    assert _kinds(other, "Northwind") == {}
    assert user_client.get(API, params={"q": "a"}).status_code == 422
    assert user_client.get(API, params={"q": "x" * 101}).status_code == 422
    assert TestClient(app).get(API, params={"q": "Northwind"}).status_code == 401
