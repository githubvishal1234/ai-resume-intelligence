from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.conftest import login_as
from tests.test_jobs import create as create_job
from tests.test_resumes import import_and_confirm

API = "/api/v1/applications"
NOTES = "/api/v1/notifications"


def _create(client: TestClient, **body: Any) -> dict[str, Any]:
    response = client.post(API, json=body)
    assert response.status_code == 201, response.text
    result: dict[str, Any] = response.json()
    return result


def test_create_from_job_defaults_and_links_resume_version(user_client: TestClient) -> None:
    job = create_job(user_client, company="Northwind").json()
    master = import_and_confirm(user_client)
    app = _create(user_client, job_id=job["id"], resume_id=master["id"])
    assert app["company"] == "Northwind"
    assert app["role"] == job["title"]
    assert app["job_title"] == job["title"]
    assert app["resume_version"] == master["current_version"]
    assert app["resume_title"] == master["title"]
    assert app["status"] == "saved" and app["applied_on"] is None
    assert [e["kind"] for e in app["events"]] == ["created"]
    assert user_client.get(API).json()[0]["id"] == app["id"]


def test_create_needs_company_and_role(user_client: TestClient) -> None:
    response = user_client.post(API, json={"company": "  ", "role": "Engineer"})
    assert response.status_code == 422
    assert response.json()["code"] == "APPLICATION_FIELDS_REQUIRED"


def test_resume_version_must_exist(user_client: TestClient) -> None:
    master = import_and_confirm(user_client)
    bad = user_client.post(
        API, json={"company": "A", "role": "B", "resume_id": master["id"], "resume_version": 9}
    )
    assert bad.status_code == 422 and bad.json()["code"] == "RESUME_VERSION_INVALID"
    orphan = user_client.post(API, json={"company": "A", "role": "B", "resume_version": 1})
    assert orphan.status_code == 422


def test_status_moves_and_edits_are_recorded(user_client: TestClient) -> None:
    app = _create(user_client, company="Acme", role="Backend Engineer")
    url = f"{API}/{app['id']}"
    moved = user_client.patch(url, json={"status": "applied"}).json()
    assert moved["applied_on"] == date.today().isoformat()
    moved = user_client.patch(url, json={"status": "interviewing", "notes": "Panel on Friday"})
    body = moved.json()
    assert body["status"] == "interviewing" and body["notes"] == "Panel on Friday"
    noted = user_client.post(f"{url}/notes", json={"note": "Sent thank-you email"}).json()
    kinds = [(e["kind"], e["from_status"], e["to_status"]) for e in noted["events"]]
    assert kinds == [
        ("note", None, None),
        ("status", "applied", "interviewing"),
        ("edited", None, None),
        ("status", "saved", "applied"),
        ("edited", None, None),
        ("created", None, "saved"),
    ]
    assert noted["events"][2]["fields"] == ["notes"]
    assert noted["events"][0]["note"] == "Sent thank-you email"
    # A no-op patch records nothing.
    same = user_client.patch(url, json={"company": "Acme"}).json()
    assert len(same["events"]) == len(noted["events"])


def test_filter_and_delete(user_client: TestClient) -> None:
    a = _create(user_client, company="A", role="R", status="applied")
    _create(user_client, company="B", role="R")
    assert [x["id"] for x in user_client.get(API, params={"status": "applied"}).json()] == [a["id"]]
    assert user_client.get(API, params={"status": "bogus"}).status_code == 422
    assert user_client.delete(f"{API}/{a['id']}").status_code == 204
    assert user_client.get(f"{API}/{a['id']}").status_code == 404


def test_deleting_the_job_keeps_the_application(user_client: TestClient) -> None:
    job = create_job(user_client, company="Northwind").json()
    app = _create(user_client, job_id=job["id"])
    assert user_client.delete(f"/api/v1/jobs/{job['id']}").status_code == 204
    kept = user_client.get(f"{API}/{app['id']}").json()
    assert kept["job_id"] is None and kept["company"] == "Northwind"


def test_follow_up_reminders_are_created_once(user_client: TestClient) -> None:
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    later = (date.today() + timedelta(days=3)).isoformat()
    due = _create(user_client, company="Acme", role="Engineer", follow_up_on=yesterday)
    _create(user_client, company="Later Co", role="Engineer", follow_up_on=later)
    _create(
        user_client, company="Closed Co", role="Engineer", follow_up_on=yesterday, status="rejected"
    )
    assert user_client.get(API).json()[-1]["follow_up_due"] is True
    assert user_client.get(f"{NOTES}/unread-count").json() == {"unread": 1}
    notes = user_client.get(NOTES).json()
    assert len(notes) == 1 and user_client.get(NOTES).json() == notes
    assert notes[0]["title"] == "Follow up with Acme"
    assert notes[0]["link"] == f"/applications/{due['id']}"
    read = user_client.post(f"{NOTES}/{notes[0]['id']}/read").json()
    assert read["read_at"] is not None
    assert user_client.get(f"{NOTES}/unread-count").json() == {"unread": 0}
    # A new follow-up date is a new reminder.
    user_client.patch(f"{API}/{due['id']}", json={"follow_up_on": date.today().isoformat()})
    assert user_client.get(f"{NOTES}/unread-count").json() == {"unread": 1}
    assert user_client.post(f"{NOTES}/read-all").status_code == 204
    assert user_client.get(f"{NOTES}/unread-count").json() == {"unread": 0}


def test_requires_auth_and_csrf(user_client: TestClient) -> None:
    del user_client.headers["x-csrf-token"]
    assert user_client.post(API, json={"company": "A", "role": "B"}).status_code == 403
    user_client.cookies.clear()
    assert user_client.get(API).status_code == 401
    assert user_client.get(NOTES).status_code == 401


def test_other_users_cannot_see_or_change_applications(
    app: FastAPI, user_client: TestClient
) -> None:
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    mine = _create(user_client, company="Acme", role="Engineer", follow_up_on=yesterday)
    note = user_client.get(NOTES).json()[0]
    job = create_job(user_client).json()
    master = import_and_confirm(user_client)

    other = login_as(app, "mallory@example.com")
    url = f"{API}/{mine['id']}"
    attempts = [
        other.get(url),
        other.patch(url, json={"status": "withdrawn"}),
        other.post(f"{url}/notes", json={"note": "x"}),
        other.delete(url),
        other.post(f"{NOTES}/{note['id']}/read"),
        # Linking someone else's job or resume is refused the same way.
        other.post(API, json={"job_id": job["id"]}),
        other.post(API, json={"company": "A", "role": "B", "resume_id": master["id"]}),
    ]
    assert [r.status_code for r in attempts] == [404] * len(attempts)
    assert other.get(API).json() == [] and other.get(NOTES).json() == []
    assert other.post(f"{NOTES}/read-all").status_code == 204
    assert user_client.get(url).json()["status"] == "saved"
    assert user_client.get(f"{NOTES}/unread-count").json() == {"unread": 1}
