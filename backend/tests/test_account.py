from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import func, select, text

from app.db.session import get_engine
from tests.conftest import STRONG_PASSWORD, login_as, register
from tests.fixtures import make_pdf

NEW_PASSWORD = "another-long-passphrase-42"


def _signed_in(app) -> TestClient:  # type: ignore[no-untyped-def]
    """A second browser for the same user (ada@example.com)."""
    other = TestClient(app, raise_server_exceptions=False)
    response = other.post(
        "/api/v1/auth/login", json={"email": "ada@example.com", "password": STRONG_PASSWORD}
    )
    assert response.status_code == 200
    other.headers["x-csrf-token"] = response.json()["csrf_token"]
    return other


def test_update_display_name(user_client: TestClient) -> None:
    response = user_client.patch("/api/v1/account", json={"display_name": "  Ada King  "})
    assert response.status_code == 200
    assert response.json()["display_name"] == "Ada King"
    assert user_client.get("/api/v1/auth/me").json()["user"]["display_name"] == "Ada King"
    assert user_client.patch("/api/v1/account", json={"display_name": "   "}).status_code == 422


def test_account_routes_need_csrf(auth_client: TestClient) -> None:
    response = auth_client.patch("/api/v1/account", json={"display_name": "X"})
    assert response.status_code == 403


def test_change_password_signs_out_other_browsers(app, user_client: TestClient) -> None:  # type: ignore[no-untyped-def]
    other = _signed_in(app)
    wrong = user_client.post(
        "/api/v1/account/password",
        json={"current_password": "nope-nope-nope", "new_password": NEW_PASSWORD},
    )
    assert wrong.status_code == 422 and wrong.json()["code"] == "WRONG_PASSWORD"
    short = user_client.post(
        "/api/v1/account/password",
        json={"current_password": STRONG_PASSWORD, "new_password": "short"},
    )
    assert short.json()["code"] == "WEAK_PASSWORD"
    same = user_client.post(
        "/api/v1/account/password",
        json={"current_password": STRONG_PASSWORD, "new_password": STRONG_PASSWORD},
    )
    assert same.json()["code"] == "SAME_PASSWORD"

    ok = user_client.post(
        "/api/v1/account/password",
        json={"current_password": STRONG_PASSWORD, "new_password": NEW_PASSWORD},
    )
    assert ok.status_code == 200 and ok.json() == {"revoked": 1}
    assert user_client.get("/api/v1/auth/me").status_code == 200
    assert other.get("/api/v1/auth/me").status_code == 401

    fresh = TestClient(app, raise_server_exceptions=False)
    login = {"email": "ada@example.com"}
    assert (
        fresh.post("/api/v1/auth/login", json={**login, "password": STRONG_PASSWORD}).status_code
        == 401
    )
    assert (
        fresh.post("/api/v1/auth/login", json={**login, "password": NEW_PASSWORD}).status_code
        == 200
    )


def test_sign_ins_list_and_revoke(app, user_client: TestClient) -> None:  # type: ignore[no-untyped-def]
    other = _signed_in(app)
    third = _signed_in(app)
    rows = user_client.get("/api/v1/account/sign-ins").json()
    assert len(rows) == 3 and sum(r["current"] for r in rows) == 1
    assert "token_hash" not in rows[0] and "csrf_token" not in rows[0]

    mine = next(r for r in other.get("/api/v1/account/sign-ins").json() if r["current"])
    assert user_client.delete(f"/api/v1/account/sign-ins/{mine['id']}").status_code == 204
    assert other.get("/api/v1/auth/me").status_code == 401

    assert user_client.post("/api/v1/account/sign-ins/revoke-others").json() == {"revoked": 1}
    assert third.get("/api/v1/auth/me").status_code == 401
    assert len(user_client.get("/api/v1/account/sign-ins").json()) == 1


def test_cannot_revoke_another_users_sign_in(app, user_client: TestClient) -> None:  # type: ignore[no-untyped-def]
    stranger = login_as(app, "eve@example.com")
    theirs = stranger.get("/api/v1/account/sign-ins").json()[0]["id"]
    assert user_client.delete(f"/api/v1/account/sign-ins/{theirs}").status_code == 404
    assert stranger.get("/api/v1/auth/me").status_code == 200


def test_delete_account_removes_data_and_files(app, user_client: TestClient, settings) -> None:  # type: ignore[no-untyped-def]
    stranger = login_as(app, "eve@example.com")
    upload = user_client.post(
        "/api/v1/resumes/imports",
        files={"file": ("cv.pdf", make_pdf(), "application/pdf")},
    )
    assert upload.status_code == 201, upload.text
    with get_engine().connect() as conn:
        user_id = conn.scalar(text("select id from users where email = 'ada@example.com'"))
        key = conn.scalar(
            text("select storage_key from resume_files where owner_id = :u"), {"u": user_id}
        )
    from pathlib import Path

    stored = Path(settings.storage_local_root) / key
    assert stored.is_file()

    wrong = user_client.post("/api/v1/account/delete", json={"password": "nope-nope-nope"})
    assert wrong.status_code == 422 and wrong.json()["code"] == "WRONG_PASSWORD"

    gone = user_client.post("/api/v1/account/delete", json={"password": STRONG_PASSWORD})
    assert gone.status_code == 204
    assert not stored.exists()
    assert user_client.get("/api/v1/auth/me").status_code == 401
    with get_engine().connect() as conn:
        for table in ("users", "resume_files", "resume_imports", "sessions"):
            count = conn.scalar(
                select(func.count())
                .select_from(text(table))
                .where(
                    text(
                        "owner_id = :u"
                        if table.startswith("resume")
                        else ("id = :u" if table == "users" else "user_id = :u")
                    )
                ),
                {"u": user_id},
            )
            assert count == 0, table
        audit = conn.execute(
            text(
                "select actor_user_id, resource_id from audit_logs"
                " where action = 'account.deleted' and outcome = 'success'"
            )
        ).one()
    assert audit.actor_user_id is None and audit.resource_id == str(user_id)
    assert stranger.get("/api/v1/auth/me").status_code == 200
    again = TestClient(app, raise_server_exceptions=False)
    assert register(again).status_code == 201  # the email is free again


def test_pro_waitlist_is_per_user_and_idempotent(app, user_client: TestClient) -> None:  # type: ignore[no-untyped-def]
    assert user_client.get("/api/v1/account/pro-waitlist").json() == {
        "joined": False,
        "joined_at": None,
    }
    first = user_client.post("/api/v1/account/pro-waitlist")
    assert first.status_code == 200 and first.json()["joined"] is True
    # Joining again keeps the first date and adds no second entry.
    second = user_client.post("/api/v1/account/pro-waitlist")
    assert second.json() == first.json()
    assert user_client.get("/api/v1/account/pro-waitlist").json() == first.json()
    with get_engine().connect() as conn:
        rows = conn.scalar(
            text("select count(*) from audit_logs where action = 'plan.pro_waitlist'")
        )
    assert rows == 1
    # Another user is not on the list.
    stranger = login_as(app, "grace@example.com")
    assert stranger.get("/api/v1/account/pro-waitlist").json()["joined"] is False


def test_pro_waitlist_needs_csrf(auth_client: TestClient) -> None:
    assert auth_client.post("/api/v1/account/pro-waitlist").status_code == 403
