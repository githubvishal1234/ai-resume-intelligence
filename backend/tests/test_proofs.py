from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.proofs.suggestions import suggest
from tests.conftest import login_as
from tests.test_jobs import create as create_job
from tests.test_resumes import import_and_confirm

API = "/api/v1/proofs"


def test_suggestions_follow_the_skill_category() -> None:
    lang = suggest("Rust")
    assert [s.kind for s in lang] == ["project", "certification"]
    assert "Rust" in lang[0].title and lang[0].plan[-1].startswith("Add it to your master resume")
    assert [s.kind for s in suggest("Communication")] == ["writeup"]
    assert [s.kind for s in suggest("React")] == ["project"]
    assert suggest("Something Unknown")[0].kind == "writeup"
    # Never invents a named certificate.
    assert "Check which Rust certifications" in suggest("Rust")[1].plan[0]


def test_create_list_update_and_evidence_status(user_client: TestClient) -> None:
    import_and_confirm(user_client)  # the sample master resume uses Python, not Rust
    job = create_job(user_client).json()
    created = user_client.post(
        API, json={"skill": "Rust", "kind": "certification", "job_id": job["id"]}
    )
    assert created.status_code == 201, created.text
    task = created.json()
    assert task["kind"] == "certification" and task["status"] == "todo"
    assert task["evidence_status"] == "missing"
    assert "Rust" in task["title"] and "\n" in task["plan"]

    python = user_client.post(API, json={"skill": "Python"}).json()
    assert python["evidence_status"] == "strong"

    moved = user_client.patch(
        f"{API}/{task['id']}", json={"status": "done", "title": "  Rust CLI  "}
    )
    assert moved.status_code == 200
    assert moved.json()["status"] == "done" and moved.json()["title"] == "Rust CLI"
    # Done is the user's word; evidence is still computed from the resume.
    assert moved.json()["evidence_status"] == "missing"
    assert {t["skill"] for t in user_client.get(API).json()} == {"Rust", "Python"}


def test_one_task_per_skill_and_no_master_means_no_status(user_client: TestClient) -> None:
    first = user_client.post(API, json={"skill": "Go"})
    assert first.status_code == 201 and first.json()["evidence_status"] is None
    again = user_client.post(API, json={"skill": "Go", "kind": "certification"})
    assert again.status_code == 409 and again.json()["code"] == "PROOF_EXISTS"


def test_unknown_kind_for_skill_falls_back_to_first_suggestion(user_client: TestClient) -> None:
    task = user_client.post(API, json={"skill": "Communication", "kind": "certification"}).json()
    assert task["kind"] == "writeup"


def test_other_users_cannot_see_or_change_a_proof(app: FastAPI, user_client: TestClient) -> None:
    task = user_client.post(API, json={"skill": "Rust"}).json()
    other = login_as(app, "other@example.com")
    assert other.get(API).json() == []
    assert other.patch(f"{API}/{task['id']}", json={"status": "done"}).status_code == 404
    assert other.delete(f"{API}/{task['id']}").status_code == 404
    job = create_job(user_client).json()
    assert other.post(API, json={"skill": "Go", "job_id": job["id"]}).status_code == 404
    assert user_client.delete(f"{API}/{task['id']}").status_code == 204
    assert user_client.get(API).json() == []


def test_validation(user_client: TestClient) -> None:
    assert user_client.post(API, json={"skill": "   "}).status_code == 422
    assert user_client.post(API, json={"skill": "Go", "kind": "course"}).status_code == 422
    assert user_client.get(f"{API}/suggestions", params={"skill": "Kubernetes"}).json()[
        "suggestions"
    ]
