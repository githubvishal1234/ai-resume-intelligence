"""Phase 2: upload safety, parsing, master resume versioning, analysis and authorization."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError, IntegrityError

from app.db.session import get_engine, get_sessionmaker
from app.models import Resume, ResumeFile, ResumeVersion
from app.resumes.analysis import analyze
from app.resumes.content import ResumeContent
from app.resumes.parser import parse_resume
from tests.conftest import login_as
from tests.fixtures import SAMPLE_TEXT, make_docm, make_docx, make_encrypted_pdf, make_pdf

API = "/api/v1/resumes"


def upload(client: TestClient, name: str, data: bytes, media: str = "application/octet-stream"):  # type: ignore[no-untyped-def]
    return client.post(f"{API}/imports", files={"file": (name, data, media)})


def import_and_confirm(
    client: TestClient, data: bytes | None = None, name: str = "resume.pdf"
) -> dict[str, Any]:
    imported = upload(client, name, data or make_pdf())
    assert imported.status_code == 201, imported.text
    body = imported.json()
    confirmed = client.post(
        f"{API}/imports/{body['id']}/confirm", json={"content": body["content"]}
    )
    assert confirmed.status_code in (200, 201), confirmed.text
    result: dict[str, Any] = confirmed.json()
    return result


# ---- parsing ---------------------------------------------------------------------------
def test_parser_extracts_sections_from_sample() -> None:
    result = parse_resume(SAMPLE_TEXT)
    c = result.content
    assert c.contact.full_name == "Priya Raman"
    assert c.contact.email == "priya.raman@example.com"
    assert c.contact.phone.startswith("+91")
    assert c.contact.location == "Bengaluru, India"
    assert "linkedin.com/in/priyaraman" in c.contact.links
    assert c.summary.startswith("Backend engineer")
    assert [(e.title, e.company) for e in c.experience] == [
        ("Senior Software Engineer", "Acme Analytics"),
        ("Software Engineer", "Brightpath Labs"),
    ]
    assert c.experience[0].current and c.experience[0].start_date == "Jan 2021"
    assert len(c.experience[0].bullets) == 2 and len(c.experience[1].bullets) == 2
    edu = c.education[0]
    assert edu.degree == "Bachelor of Technology" and edu.field_of_study == "Computer Science"
    assert "Institute of Technology" in edu.institution and edu.end_date == "2018"
    names = [s.name for s in c.skills]
    assert names[:3] == ["Python", "SQL", "Go"] and "Terraform" in names
    assert {s.section: s.confidence for s in result.sections}["experience"] == "high"


def test_parser_never_invents_text() -> None:
    """Every extracted bullet and skill must appear verbatim in the source text."""
    content = parse_resume(SAMPLE_TEXT).content
    flat = " ".join(SAMPLE_TEXT.split())
    for role in content.experience:
        for bullet in role.bullets:
            assert bullet in flat
    for skill in content.skills:
        assert skill.name in SAMPLE_TEXT


def test_parser_wraps_continuation_lines_into_previous_bullet() -> None:
    text = (
        "Jane Doe\njane@example.com\n\nEXPERIENCE\nEngineer | Initech\nMar 2019 - Present\n"
        "• Built a billing system used by\n  12 internal teams and 3 partners.\n"
        "• Cut deploy time by 50%.\n"
    )
    role = parse_resume(text).content.experience[0]
    assert role.bullets == [
        "Built a billing system used by 12 internal teams and 3 partners.",
        "Cut deploy time by 50%.",
    ]


def test_parser_without_headings_keeps_text_and_warns() -> None:
    result = parse_resume("John Smith\njohn@example.com\nI like building things with code.\n")
    assert result.warnings
    assert result.content.other and result.content.other[0].heading == "Unsorted"
    assert "I like building things with code." in result.content.other[0].lines


# ---- upload safety ---------------------------------------------------------------------
@pytest.mark.parametrize(
    ("name", "data", "code"),
    [
        ("resume.pdf", b"PK\x03\x04 not a pdf", "UPLOAD_REJECTED"),
        ("resume.docx", b"%PDF-1.4 not a docx", "UPLOAD_REJECTED"),
        ("resume.exe", b"MZ\x90\x00", "UPLOAD_REJECTED"),
        ("resume.doc", b"\xd0\xcf\x11\xe0", "UPLOAD_REJECTED"),
        ("resume.txt", b"abc\x00\x00binary", "UPLOAD_REJECTED"),
        ("resume.txt", b"", "UPLOAD_REJECTED"),
        ("resume.txt", b"   \n  ", "RESUME_EXTRACTION_FAILED"),
    ],
)
def test_upload_rejects_bad_files(
    user_client: TestClient, name: str, data: bytes, code: str
) -> None:
    response = upload(user_client, name, data)
    assert response.status_code == 422, response.text
    assert response.json()["code"] == code


def test_upload_rejects_encrypted_pdf_and_macro_docx(user_client: TestClient) -> None:
    pdf = upload(user_client, "resume.pdf", make_encrypted_pdf())
    assert pdf.status_code == 422 and "Password" in pdf.json()["message"]
    docm = upload(user_client, "resume.docx", make_docm())
    assert docm.status_code == 422 and "Macro" in docm.json()["message"]


def test_upload_rejects_oversized_file(settings, app: FastAPI, user_client: TestClient) -> None:  # type: ignore[no-untyped-def]
    from app.core.config import get_settings

    app.dependency_overrides[get_settings] = lambda: settings.model_copy(
        update={"max_upload_bytes": 1000}
    )
    response = upload(user_client, "resume.pdf", make_pdf())
    assert response.status_code == 413
    assert response.json()["code"] == "UPLOAD_TOO_LARGE"


def test_rejected_upload_stores_nothing(user_client: TestClient) -> None:
    upload(user_client, "resume.pdf", b"not a pdf")
    with get_sessionmaker()() as db:
        assert db.scalar(select(ResumeFile)) is None


def test_upload_requires_auth_and_csrf(client: TestClient, user_client: TestClient) -> None:
    del user_client.headers["x-csrf-token"]
    response = upload(user_client, "resume.pdf", make_pdf())
    assert response.status_code == 403 and response.json()["code"] == "CSRF_INVALID"


@pytest.mark.parametrize(("name", "maker"), [("cv.pdf", make_pdf), ("cv.docx", make_docx)])
def test_upload_parses_pdf_and_docx(user_client: TestClient, name: str, maker) -> None:  # type: ignore[no-untyped-def]
    response = upload(user_client, name, maker())
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "pending_review" and body["has_master"] is False
    assert body["content"]["contact"]["email"] == "priya.raman@example.com"
    assert len(body["content"]["experience"]) == 2
    assert body["report"]["file_kind"] == name.rsplit(".", 1)[1]
    assert {s["section"] for s in body["report"]["sections"]} >= {"contact", "experience"}


def test_upload_filename_is_sanitized_for_display(user_client: TestClient) -> None:
    response = upload(user_client, "../../etc/<script>cv.pdf", make_pdf())
    assert response.status_code == 201
    assert response.json()["filename"] == "_script_cv.pdf"
    with get_sessionmaker()() as db:
        file = db.scalar(select(ResumeFile))
        assert file is not None
        assert ".." not in file.storage_key and "script" not in file.storage_key


# ---- confirm, versions, edits ----------------------------------------------------------
def test_confirm_creates_master_then_new_upload_adds_version(user_client: TestClient) -> None:
    first = import_and_confirm(user_client)
    assert first["kind"] == "master" and first["current_version"] == 1
    second = import_and_confirm(user_client, make_docx(), name="resume.docx")
    assert second["id"] == first["id"] and second["current_version"] == 2
    versions = user_client.get(f"{API}/{first['id']}/versions").json()
    assert [(v["version"], v["source"], v["has_file"]) for v in versions] == [
        (2, "upload", True),
        (1, "upload", True),
    ]
    listing = user_client.get(API).json()
    assert len(listing) == 1


def test_import_cannot_be_confirmed_twice(user_client: TestClient) -> None:
    imported = upload(user_client, "cv.pdf", make_pdf()).json()
    url = f"{API}/imports/{imported['id']}/confirm"
    assert user_client.post(url, json={"content": imported["content"]}).status_code == 201
    again = user_client.post(url, json={"content": imported["content"]})
    assert again.status_code == 409 and again.json()["code"] == "IMPORT_NOT_PENDING"


def test_user_edits_from_review_are_what_gets_saved(user_client: TestClient) -> None:
    imported = upload(user_client, "cv.pdf", make_pdf()).json()
    content = imported["content"]
    content["summary"] = "Edited during review."
    saved = user_client.post(f"{API}/imports/{imported['id']}/confirm", json={"content": content})
    assert saved.json()["content"]["summary"] == "Edited during review."


def test_discard_import_removes_file(user_client: TestClient) -> None:
    imported = upload(user_client, "cv.pdf", make_pdf()).json()
    assert user_client.post(f"{API}/imports/{imported['id']}/discard").status_code == 204
    with get_sessionmaker()() as db:
        assert db.scalar(select(ResumeFile)) is None
    assert user_client.get(f"{API}/imports/{imported['id']}").status_code == 404


def test_edit_creates_version_and_rejects_stale_base(user_client: TestClient) -> None:
    resume = import_and_confirm(user_client)
    content = resume["content"]
    content["summary"] = "New summary."
    url = f"{API}/{resume['id']}/content"
    ok = user_client.put(url, json={"base_version": 1, "content": content, "note": "summary"})
    assert ok.status_code == 200 and ok.json()["current_version"] == 2
    stale = user_client.put(url, json={"base_version": 1, "content": content})
    assert stale.status_code == 409 and stale.json()["code"] == "VERSION_CONFLICT"
    old = user_client.get(f"{API}/{resume['id']}/versions/1").json()
    assert old["content"]["summary"].startswith("Backend engineer")  # v1 untouched


def test_unchanged_edit_does_not_create_version(user_client: TestClient) -> None:
    resume = import_and_confirm(user_client)
    url = f"{API}/{resume['id']}/content"
    again = user_client.put(url, json={"base_version": 1, "content": resume["content"]})
    assert again.json()["current_version"] == 1


def test_restore_appends_a_new_version(user_client: TestClient) -> None:
    resume = import_and_confirm(user_client)
    content = resume["content"]
    content["summary"] = "Changed."
    user_client.put(f"{API}/{resume['id']}/content", json={"base_version": 1, "content": content})
    restored = user_client.post(
        f"{API}/{resume['id']}/versions/1/restore", json={"base_version": 2}
    )
    assert restored.status_code == 200
    body = restored.json()
    assert body["current_version"] == 3 and body["content"]["summary"].startswith("Backend")
    meta = user_client.get(f"{API}/{resume['id']}/versions").json()[0]
    assert meta["source"] == "restore" and meta["note"] == "Restored from version 1"


def test_create_from_scratch_and_single_master_rule(user_client: TestClient) -> None:
    content = {"contact": {"full_name": "Ada Lovelace", "email": "ada@example.com"}}
    created = user_client.post(API, json={"title": "Main", "content": content})
    assert created.status_code == 201 and created.json()["current_version"] == 1
    second = user_client.post(API, json={"title": "Another", "content": content})
    assert second.status_code == 409 and second.json()["code"] == "MASTER_RESUME_EXISTS"


def test_empty_resume_rejected(user_client: TestClient) -> None:
    response = user_client.post(API, json={"title": "Empty"})
    assert response.status_code == 422 and response.json()["code"] == "RESUME_EMPTY"


def test_content_validation_limits_and_duplicate_ids(user_client: TestClient) -> None:
    dup = {"skills": [{"id": "s1", "name": "Go"}, {"id": "s1", "name": "Rust"}]}
    assert user_client.post(API, json={"content": dup}).status_code == 422
    extra = {"contact": {"full_name": "A"}, "secret": "x"}
    assert user_client.post(API, json={"content": extra}).status_code == 422


def test_rename_and_download_original(user_client: TestClient) -> None:
    resume = import_and_confirm(user_client)
    renamed = user_client.patch(f"{API}/{resume['id']}", json={"title": "My master"})
    assert renamed.json()["title"] == "My master" and renamed.json()["current_version"] == 1
    file = user_client.get(f"{API}/{resume['id']}/versions/1/file")
    assert file.status_code == 200 and file.content.startswith(b"%PDF-")
    assert "attachment" in file.headers["content-disposition"]


def test_delete_removes_resume_versions_and_files(user_client: TestClient) -> None:
    resume = import_and_confirm(user_client)
    with get_sessionmaker()() as db:
        key = db.scalars(select(ResumeFile.storage_key)).one()
    from app.core.config import get_settings
    from app.storage.base import get_storage

    storage = get_storage(get_settings())
    assert storage.exists(key)
    assert user_client.delete(f"{API}/{resume['id']}").status_code == 204
    assert user_client.get(f"{API}/{resume['id']}").status_code == 404
    assert not storage.exists(key)
    with get_sessionmaker()() as db:
        assert db.scalar(select(ResumeVersion)) is None and db.scalar(select(ResumeFile)) is None


# ---- database invariants ---------------------------------------------------------------
def test_versions_are_immutable_in_the_database(user_client: TestClient) -> None:
    import_and_confirm(user_client)
    with pytest.raises(DBAPIError, match="immutable"), get_engine().begin() as conn:
        conn.execute(text("update resume_versions set content = '{}'::jsonb"))


def test_database_allows_only_one_active_master(user_client: TestClient) -> None:
    resume = import_and_confirm(user_client)
    with get_sessionmaker()() as db:
        owner = db.scalars(select(Resume.owner_id)).one()
        db.add(Resume(owner_id=owner, kind="master", status="active", title="x"))
        with pytest.raises(IntegrityError):
            db.commit()
    assert resume["id"]


# ---- authorization ---------------------------------------------------------------------
def test_other_users_cannot_see_or_change_a_resume(app: FastAPI, user_client: TestClient) -> None:
    resume = import_and_confirm(user_client)
    pending = upload(user_client, "cv.pdf", make_pdf()).json()
    rid, iid = resume["id"], pending["id"]
    intruder = login_as(app, "mallory@example.com")
    attempts = [
        intruder.get(f"{API}/{rid}"),
        intruder.get(f"{API}/{rid}/versions"),
        intruder.get(f"{API}/{rid}/versions/1"),
        intruder.get(f"{API}/{rid}/versions/1/file"),
        intruder.get(f"{API}/{rid}/analysis"),
        intruder.put(
            f"{API}/{rid}/content", json={"base_version": 1, "content": resume["content"]}
        ),
        intruder.patch(f"{API}/{rid}", json={"title": "pwned"}),
        intruder.post(f"{API}/{rid}/versions/1/restore", json={"base_version": 1}),
        intruder.delete(f"{API}/{rid}"),
        intruder.get(f"{API}/imports/{iid}"),
        intruder.post(f"{API}/imports/{iid}/confirm", json={"content": pending["content"]}),
        intruder.post(f"{API}/imports/{iid}/discard"),
    ]
    assert [r.status_code for r in attempts] == [404] * len(attempts)
    assert intruder.get(API).json() == []
    assert user_client.get(f"{API}/{rid}").json()["title"] != "pwned"


def test_resume_routes_require_auth(client: TestClient) -> None:
    assert client.get(API).status_code == 401


# ---- analysis --------------------------------------------------------------------------
def test_analysis_endpoint_scores_current_version(user_client: TestClient) -> None:
    resume = import_and_confirm(user_client)
    body = user_client.get(f"{API}/{resume['id']}/analysis").json()
    assert body["version"] == 1 and body["method_version"] == "rules-v1"
    assert 0 <= body["score"] <= 100
    checks = {c["id"]: c["status"] for c in body["checks"]}
    assert checks["contact.email"] == "pass"
    assert checks["experience.dates"] == "pass"
    assert checks["bullets.quantified"] == "pass"


def test_analysis_flags_gaps() -> None:
    score, checks = analyze(
        ResumeContent.model_validate(
            {
                "contact": {"full_name": "A B"},
                "experience": [{"title": "Dev", "bullets": ["I did some work on things"]}],
            }
        )
    )
    status = {c.id: c.status for c in checks}
    assert status["contact.email"] == "fail"
    assert status["experience.dates"] == "fail"
    assert status["bullets.quantified"] == "warn"
    assert status["style.first_person"] == "warn"
    assert score < 60
