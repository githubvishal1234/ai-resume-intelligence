from __future__ import annotations

import os
import tempfile
from collections.abc import Iterator

# Must be set before the app imports settings.
os.environ["APP_ENV"] = "test"
# Tests drop and truncate tables, so they only ever use TEST_DATABASE_URL (never DATABASE_URL)
# and refuse to run unless the database name ends in "_test".
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://resume_app:dev_only_password@localhost:5432/resume_intel_test",
)
if not os.environ["DATABASE_URL"].rsplit("/", 1)[-1].split("?")[0].endswith("_test"):
    raise RuntimeError("Refusing to run tests: the test database name must end in '_test'.")
os.environ["STORAGE_LOCAL_ROOT"] = tempfile.mkdtemp(prefix="resume-intel-test-storage-")
os.environ["LLM_PROVIDER"] = ""
os.environ["EMAIL_PROVIDER"] = ""

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.auth.router import reset_rate_limiters  # noqa: E402
from app.core.config import Settings, get_settings  # noqa: E402
from app.db.session import get_engine  # noqa: E402
from app.main import create_app  # noqa: E402


def _alembic_config() -> Config:
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option(
        "script_location", os.path.join(os.path.dirname(__file__), "..", "migrations")
    )
    return cfg


@pytest.fixture(scope="session", autouse=True)
def _migrated_database() -> Iterator[None]:
    """Build the schema ONLY through Alembic so the migration itself is under test."""
    cfg = _alembic_config()
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    yield


@pytest.fixture(autouse=True)
def _clean_state() -> Iterator[None]:
    with get_engine().begin() as conn:
        conn.execute(text("TRUNCATE audit_logs, sessions, users CASCADE"))
    reset_rate_limiters()
    yield


@pytest.fixture
def settings() -> Settings:
    return get_settings()


@pytest.fixture
def app(settings: Settings):  # type: ignore[no-untyped-def]
    application = create_app(settings)
    application.dependency_overrides[get_settings] = lambda: settings
    return application


@pytest.fixture
def client(app) -> Iterator[TestClient]:  # type: ignore[no-untyped-def]
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


STRONG_PASSWORD = "correct-horse-battery-staple"


def register(client: TestClient, email: str = "ada@example.com", password: str = STRONG_PASSWORD):  # type: ignore[no-untyped-def]
    return client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "display_name": "Ada Lovelace"},
    )


def login_as(app, email: str) -> TestClient:  # type: ignore[no-untyped-def]
    """A second, independent client signed in as a new user (for authorization tests)."""
    other = TestClient(app, raise_server_exceptions=False)
    response = register(other, email)
    assert response.status_code == 201
    other.headers["x-csrf-token"] = response.json()["csrf_token"]
    return other


@pytest.fixture
def auth_client(client: TestClient) -> TestClient:
    """A client with a logged-in user; exposes csrf via `client.csrf`."""
    response = register(client)
    assert response.status_code == 201
    client.csrf = response.json()["csrf_token"]  # type: ignore[attr-defined]
    return client


@pytest.fixture
def user_client(client: TestClient) -> TestClient:
    """Signed-in client that sends the CSRF header on every request."""
    response = register(client)
    assert response.status_code == 201
    client.headers["x-csrf-token"] = response.json()["csrf_token"]
    return client
