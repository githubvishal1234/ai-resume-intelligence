"""Config guards, authorization seam, provider boundaries, storage safety, DB constraints."""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.ai.provider import (
    LLMCapabilities,
    LLMMessage,
    LLMProvider,
    LLMUsage,
    StructuredResult,
)
from app.ai.registry import ai_status, get_llm_provider, register_provider, unregister_provider
from app.core.access import Actor, ensure_access
from app.core.config import Settings
from app.core.errors import AiProviderNotConfigured, NotFound
from app.db.session import get_engine
from app.mail.base import EmailNotConfigured, get_email_sender
from app.storage.base import InvalidStorageKey, StorageNotFound
from app.storage.local import LocalStorage
from tests.conftest import register


# ---- configuration --------------------------------------------------------------------
def test_production_rejects_unsafe_config() -> None:
    with pytest.raises(ValidationError) as exc:
        Settings(app_env="production")  # dev DB password + insecure cookie
    assert "DATABASE_URL" in str(exc.value) and "SESSION_COOKIE_SECURE" in str(exc.value)


def test_production_accepts_safe_config() -> None:
    Settings(
        app_env="production",
        database_url="postgresql+psycopg://u:strong-secret@db:5432/app",
        session_cookie_secure=True,
    )


def test_cors_origins_parsed_from_comma_string() -> None:
    s = Settings(cors_origins="http://a.test, http://b.test")  # type: ignore[arg-type]
    assert s.cors_origins == ["http://a.test", "http://b.test"]


# ---- authorization seam ---------------------------------------------------------------
def test_owner_only_policy_hides_other_users_resources_as_not_found() -> None:
    owner, intruder = uuid.uuid4(), uuid.uuid4()
    ensure_access(Actor(user_id=owner), owner)
    with pytest.raises(NotFound):
        ensure_access(Actor(user_id=intruder), owner)


# ---- AI provider boundary -------------------------------------------------------------
def test_ai_not_configured_by_default(settings: Settings) -> None:
    status = ai_status(settings)
    assert status.configured is False
    with pytest.raises(AiProviderNotConfigured) as exc:
        get_llm_provider(settings)
    assert exc.value.code == "AI_PROVIDER_NOT_CONFIGURED"


def test_unknown_provider_is_reported_not_configured(settings: Settings) -> None:
    s = settings.model_copy(update={"llm_provider": "acme", "llm_model": "m1"})
    status = ai_status(s)
    assert not status.configured and "No adapter" in (status.reason or "")


class _FakeProvider(LLMProvider):
    """Test-only. Production registry is empty; this never ships as a real provider."""

    name = "fake"

    @property
    def model(self) -> str:
        return "fake-1"

    @property
    def capabilities(self) -> LLMCapabilities:
        return LLMCapabilities(structured_output=True)

    def generate_structured(self, schema, messages: list[LLMMessage], *, max_output_tokens=None):  # type: ignore[no-untyped-def]
        return StructuredResult(
            parsed=schema(), usage=LLMUsage(), provider="fake", model="fake-1", latency_ms=0.0
        )


@pytest.fixture
def fake_provider() -> Iterator[None]:
    register_provider("fake", lambda s: _FakeProvider())
    yield
    unregister_provider("fake")


def test_registry_resolves_configured_provider(settings: Settings, fake_provider: None) -> None:
    s = settings.model_copy(update={"llm_provider": "fake", "llm_model": "fake-1"})
    assert ai_status(s).configured
    assert get_llm_provider(s).name == "fake"


def test_capabilities_endpoint_reports_not_configured(auth_client: TestClient) -> None:
    body = auth_client.get("/api/v1/system/capabilities").json()
    assert body["ai"]["configured"] is False
    assert body["email"]["configured"] is False
    assert body["benchmarks"]["available"] is False
    assert body["job_sources"]["external_adapters"] == ["greenhouse", "lever", "ashby", "jsonld"]


def test_email_not_configured_raises(settings: Settings) -> None:
    with pytest.raises(EmailNotConfigured):
        get_email_sender(settings)


# ---- storage ---------------------------------------------------------------------------
def test_local_storage_roundtrip(tmp_path: Path) -> None:
    store = LocalStorage(tmp_path)
    store.put("resumes/abc.bin", b"data")
    assert store.exists("resumes/abc.bin") and store.get("resumes/abc.bin") == b"data"
    store.delete("resumes/abc.bin")
    assert not store.exists("resumes/abc.bin")
    with pytest.raises(StorageNotFound):
        store.get("resumes/abc.bin")


@pytest.mark.parametrize(
    "key",
    ["../etc/passwd", "a/../../b", "/abs", "a//b", "", "a/", "bad key", "a\\b", ".hidden/../x"],
)
def test_local_storage_rejects_traversal_and_bad_keys(tmp_path: Path, key: str) -> None:
    with pytest.raises(InvalidStorageKey):
        LocalStorage(tmp_path).put(key, b"x")


def test_local_storage_rejects_symlink_escape(tmp_path: Path) -> None:
    outside = tmp_path / "outside"
    outside.mkdir()
    root = tmp_path / "root"
    root.mkdir()
    try:
        (root / "link").symlink_to(outside)
    except OSError:  # Windows without Developer Mode or admin rights
        pytest.skip("this OS user cannot create symlinks")
    store = LocalStorage(root)
    with pytest.raises(StorageNotFound):
        store.put("link/escape.txt", b"x")
    assert not (outside / "escape.txt").exists()


# ---- database constraints --------------------------------------------------------------
def test_db_enforces_lowercase_email_and_unique() -> None:
    with pytest.raises(IntegrityError), get_engine().begin() as conn:
        conn.execute(
            text(
                "insert into users (id,email,password_hash,display_name) "
                "values (gen_random_uuid(),'UPPER@x.com','h','n')"
            )
        )


def test_deleting_user_cascades_sessions_and_nulls_audit_actor(client: TestClient) -> None:
    register(client)
    with get_engine().begin() as conn:
        conn.execute(text("delete from users"))
        assert conn.execute(text("select count(*) from sessions")).scalar_one() == 0
        remaining = conn.execute(text("select count(*) from audit_logs")).scalar_one()
        assert remaining >= 1
        assert (
            conn.execute(
                text("select count(*) from audit_logs where actor_user_id is not null")
            ).scalar_one()
            == 0
        )
