from __future__ import annotations

import asyncio

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.errors import NotFound


def test_liveness(client: TestClient) -> None:
    response = client.get("/api/v1/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_readiness_checks_database(client: TestClient) -> None:
    response = client.get("/api/v1/health/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "up", "migrations": "current"}


def test_readiness_reports_unavailable_without_leaking(app: FastAPI, client: TestClient) -> None:
    from app.db.session import get_db

    class BrokenSession:
        def execute(self, *_: object, **__: object) -> None:
            raise RuntimeError("password=hunter2 host=10.0.0.5")

        def close(self) -> None: ...

        def rollback(self) -> None: ...

    app.dependency_overrides[get_db] = lambda: iter([BrokenSession()])
    response = client.get("/api/v1/health/ready")
    assert response.status_code == 503
    assert "hunter2" not in response.text and "10.0.0.5" not in response.text


def test_readiness_fails_when_migrations_are_pending(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.api.v1 import health

    monkeypatch.setattr(health, "migration_heads", lambda: frozenset({"not-applied-yet"}))
    response = client.get("/api/v1/health/ready")
    assert response.status_code == 503
    assert response.json()["migrations"] == "pending"


def test_slow_requests_are_logged(caplog: pytest.LogCaptureFixture) -> None:
    from starlette.applications import Starlette
    from starlette.responses import PlainTextResponse
    from starlette.routing import Route

    from app.core.middleware import RequestContextMiddleware

    async def slow(_: object) -> PlainTextResponse:
        await asyncio.sleep(0.03)
        return PlainTextResponse("ok")

    async def quick(_: object) -> PlainTextResponse:
        return PlainTextResponse("ok")

    inner = Starlette(routes=[Route("/slow", slow), Route("/quick", quick)])
    client = TestClient(RequestContextMiddleware(inner, slow_request_ms=20))
    with caplog.at_level("WARNING", logger="app.request"):
        client.get("/quick")
        client.get("/slow")
    slow_logs = [r for r in caplog.records if r.message == "slow_request"]
    assert [getattr(r, "path", None) for r in slow_logs] == ["/slow"]


def test_request_id_generated_and_security_headers(client: TestClient) -> None:
    response = client.get("/api/v1/health/live")
    assert len(response.headers["x-request-id"]) >= 8
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert "server-timing" in response.headers


def test_valid_incoming_request_id_is_echoed_invalid_is_replaced(client: TestClient) -> None:
    ok = client.get("/api/v1/health/live", headers={"x-request-id": "abc-12345678"})
    assert ok.headers["x-request-id"] == "abc-12345678"
    bad = client.get("/api/v1/health/live", headers={"x-request-id": "bad id\twith spaces!!"})
    assert bad.headers["x-request-id"] != "bad id\twith spaces!!"


def test_not_found_uses_error_envelope(client: TestClient) -> None:
    response = client.get("/api/v1/nope")
    assert response.status_code == 404
    body = response.json()
    assert body["code"] == "NOT_FOUND"
    assert body["request_id"] == response.headers["x-request-id"]


def test_validation_error_never_echoes_submitted_values(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/login", json={"email": "not-an-email", "password": "SuperSecret-Value-123"}
    )
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "VALIDATION_ERROR"
    assert "SuperSecret-Value-123" not in response.text
    assert body["details"][0]["field"] == "email"


def test_unhandled_exception_returns_safe_500(app: FastAPI, client: TestClient) -> None:
    @app.get("/api/v1/_boom")
    def boom() -> None:
        raise RuntimeError("SELECT * FROM users WHERE password='secret' /tmp/app/secret.py")

    response = client.get("/api/v1/_boom")
    assert response.status_code == 500
    body = response.json()
    assert body["code"] == "INTERNAL_ERROR"
    assert body["request_id"] == response.headers["x-request-id"]
    assert "SELECT" not in response.text and "secret" not in response.text


def test_app_error_maps_to_envelope(app: FastAPI, client: TestClient) -> None:
    @app.get("/api/v1/_missing")
    def missing() -> None:
        raise NotFound()

    response = client.get("/api/v1/_missing")
    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"


def test_docs_are_available_outside_production(client: TestClient) -> None:
    assert client.get("/api/openapi.json").status_code == 200
