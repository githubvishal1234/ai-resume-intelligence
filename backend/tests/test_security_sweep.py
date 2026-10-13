"""Route sweep: every API route either is on the public allowlist or needs a session, and
every unsafe method also needs the CSRF header. New routes are covered automatically."""

from __future__ import annotations

import re
import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

PUBLIC = {
    ("GET", "/api/v1/health/live"),
    ("GET", "/api/v1/health/ready"),
    ("GET", "/api/v1/system/capabilities"),
    ("POST", "/api/v1/auth/register"),
    ("POST", "/api/v1/auth/login"),
    ("GET", "/api/v1/auth/options"),
    ("POST", "/api/v1/auth/password-reset/request"),
    ("POST", "/api/v1/auth/password-reset/confirm"),
    ("POST", "/api/v1/auth/logout"),  # no session: nothing to log out, answers without effect
}
UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}


def _routes(app: FastAPI) -> list[tuple[str, str]]:
    """Every operation in the OpenAPI schema, which is what clients can call."""
    return [
        (method.upper(), path)
        for path, operations in app.openapi()["paths"].items()
        for method in operations
        if method.upper() in {"GET", "POST", "PUT", "PATCH", "DELETE"}
    ]


def _fill(path: str) -> str:
    def value(match: re.Match[str]) -> str:
        return "0123456789ab" if "question" in match.group(1) else str(uuid.uuid4())

    return re.sub(r"\{([^}]+)\}", value, path)


def test_the_public_allowlist_is_exact(app: FastAPI) -> None:
    routes = set(_routes(app))
    assert routes >= PUBLIC  # the allowlist names real routes only
    assert len(routes) > 60


def test_every_private_route_needs_a_session(app: FastAPI) -> None:
    client = TestClient(app, raise_server_exceptions=False)
    failures = []
    for method, path in _routes(app):
        if (method, path) in PUBLIC:
            continue
        response = client.request(method, _fill(path), json={})
        body = response.json()
        if (
            response.status_code != 401
            or body.get("code") != "AUTH_REQUIRED"
            or not body.get("request_id")
        ):
            failures.append((method, path, response.status_code))
    assert failures == []


def test_every_unsafe_private_route_needs_the_csrf_header(
    app: FastAPI, auth_client: TestClient
) -> None:
    # auth_client is signed in but does not send X-CSRF-Token.
    failures = []
    for method, path in _routes(app):
        if method not in UNSAFE or (method, path) in PUBLIC:
            continue
        response = auth_client.request(method, _fill(path), json={})
        if response.status_code != 403 or response.json().get("code") != "CSRF_INVALID":
            failures.append((method, path, response.status_code))
    assert failures == []


@pytest.mark.parametrize(
    "path", ["/api/v1/health/live", "/api/v1/resumes", "/api/v1/does-not-exist"]
)
def test_security_headers_on_every_response(client: TestClient, path: str) -> None:
    response = client.get(path)
    for header in ("x-content-type-options", "x-frame-options", "content-security-policy"):
        assert header in response.headers
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-request-id"]
