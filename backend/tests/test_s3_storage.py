from __future__ import annotations

import hashlib
import threading
from collections.abc import Iterator
from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.core.config import Settings, get_settings
from app.storage.base import StorageNotFound, get_storage
from app.storage.s3 import S3NotConfigured, S3Storage, StorageError, sign
from tests.conftest import STRONG_PASSWORD
from tests.fixtures import make_pdf

SECRET = "test-secret-key"


class FakeS3:
    """Stand-in for an S3 service. It checks each request's SigV4 signature against what it
    actually received (host, path, signed headers, body hash) before answering."""

    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.force_status: int | None = None
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args: object) -> None:
                pass

            def _verify(self, body: bytes) -> bool:
                auth = self.headers.get("authorization", "")
                names = auth.split("SignedHeaders=")[1].split(",")[0].split(";")
                if hashlib.sha256(body).hexdigest() != self.headers["x-amz-content-sha256"]:
                    return False
                extra = {
                    n: self.headers[n]
                    for n in names
                    if n not in ("host", "x-amz-content-sha256", "x-amz-date")
                }
                expected = sign(
                    method=self.command,
                    host=self.headers["host"],
                    path=self.path,
                    headers=extra,
                    payload_sha256=self.headers["x-amz-content-sha256"],
                    access_key="AKIATEST",
                    secret_key=SECRET,
                    region="eu-test-1",
                    when=datetime.strptime(self.headers["x-amz-date"], "%Y%m%dT%H%M%SZ").replace(
                        tzinfo=UTC
                    ),
                )
                return expected["authorization"] == auth

            def _answer(self, status: int, body: bytes = b"") -> None:
                self.send_response(status)
                self.send_header("content-length", str(len(body)))
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(body)

            def _handle(self) -> None:
                length = int(self.headers.get("content-length") or 0)
                body = self.rfile.read(length) if length else b""
                if outer.force_status:
                    return self._answer(outer.force_status, b"<Error>denied</Error>")
                if not self._verify(body):
                    return self._answer(403, b"<Error>SignatureDoesNotMatch</Error>")
                key = self.path
                if self.command == "PUT":
                    outer.objects[key] = body
                    return self._answer(200)
                if self.command == "DELETE":
                    outer.objects.pop(key, None)
                    return self._answer(204)
                if key not in outer.objects:
                    return self._answer(404, b"<Error>NoSuchKey</Error>")
                return self._answer(200, outer.objects[key])

            do_PUT = do_GET = do_DELETE = do_HEAD = _handle  # noqa: N815

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.port = self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()


@pytest.fixture
def s3() -> Iterator[FakeS3]:
    server = FakeS3()
    yield server
    server.close()


def _s3_settings(settings: Settings, s3: FakeS3, **extra: object) -> Settings:
    return settings.model_copy(
        update={
            "storage_backend": "s3",
            "s3_endpoint_url": f"http://127.0.0.1:{s3.port}",
            "s3_bucket": "resumes",
            "s3_region": "eu-test-1",
            "s3_access_key_id": "AKIATEST",
            "s3_secret_access_key": SecretStr(SECRET),
            **extra,
        }
    )


def test_signature_matches_the_aws_example() -> None:
    # "GET Object" example from the AWS Signature Version 4 documentation for S3.
    headers = sign(
        method="GET",
        host="examplebucket.s3.amazonaws.com",
        path="/test.txt",
        headers={"range": "bytes=0-9"},
        payload_sha256=hashlib.sha256(b"").hexdigest(),
        access_key="AKIAIOSFODNN7EXAMPLE",
        secret_key="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        region="us-east-1",
        when=datetime(2013, 5, 24, tzinfo=UTC),
    )
    assert headers["authorization"].endswith(
        "Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41"
    )


def test_roundtrip_with_path_addressing_and_prefix(settings: Settings, s3: FakeS3) -> None:
    store = get_storage(_s3_settings(settings, s3, s3_prefix="/prod/"))
    assert isinstance(store, S3Storage)
    store.put("resumes/abc.pdf", b"%PDF data")
    assert list(s3.objects) == ["/resumes/prod/resumes/abc.pdf"]
    assert store.exists("resumes/abc.pdf") and store.get("resumes/abc.pdf") == b"%PDF data"
    store.delete("resumes/abc.pdf")
    assert not store.exists("resumes/abc.pdf")
    with pytest.raises(StorageNotFound):
        store.get("resumes/abc.pdf")
    store.delete("resumes/abc.pdf")  # deleting a missing object is not an error


def test_rejects_unsafe_keys(settings: Settings, s3: FakeS3) -> None:
    store = get_storage(_s3_settings(settings, s3))
    with pytest.raises(ValueError):
        store.put("../escape", b"x")


def test_errors_never_include_the_secret(settings: Settings, s3: FakeS3) -> None:
    store = get_storage(_s3_settings(settings, s3))
    s3.force_status = 403
    with pytest.raises(StorageError) as caught:
        store.put("a.bin", b"x")
    assert "403" in str(caught.value) and SECRET not in str(caught.value)
    s3.close()
    with pytest.raises(StorageError, match="unreachable"):
        store.get("a.bin")


def test_missing_settings_are_named(settings: Settings) -> None:
    with pytest.raises(S3NotConfigured, match="S3_ENDPOINT_URL, S3_BUCKET"):
        get_storage(settings.model_copy(update={"storage_backend": "s3"}))


def test_production_requires_https() -> None:
    with pytest.raises(ValueError, match="S3_ENDPOINT_URL must use https"):
        Settings(
            app_env="production",
            database_url="mssql+pyodbc://u:strong@db/x",
            session_cookie_secure=True,
            storage_backend="s3",
            s3_endpoint_url="http://minio:9000",
        )


def test_uploads_and_account_deletion_use_s3(app, settings: Settings, s3: FakeS3) -> None:  # type: ignore[no-untyped-def]
    configured = _s3_settings(settings, s3)
    app.dependency_overrides[get_settings] = lambda: configured
    c = TestClient(app, raise_server_exceptions=False)
    signup = c.post(
        "/api/v1/auth/register",
        json={"email": "ada@example.com", "password": STRONG_PASSWORD, "display_name": "Ada"},
    )
    c.headers["x-csrf-token"] = signup.json()["csrf_token"]
    upload = c.post(
        "/api/v1/resumes/imports", files={"file": ("cv.pdf", make_pdf(), "application/pdf")}
    )
    assert upload.status_code == 201, upload.text
    assert len(s3.objects) == 1 and next(iter(s3.objects.values())).startswith(b"%PDF")
    assert c.get("/api/v1/system/capabilities").json()["storage"]["backend"] == "s3"
    gone = c.post("/api/v1/account/delete", json={"password": STRONG_PASSWORD})
    assert gone.status_code == 204
    assert s3.objects == {}
