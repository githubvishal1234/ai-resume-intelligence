"""Storage over the generic S3 API (AWS Signature Version 4), with no vendor SDK.

Works with any service that implements the S3 object API. Which one is a pending decision
(D-06); everything comes from the environment. Objects are private: nothing here creates
public URLs, and downloads still go through the API's authenticated endpoints.
"""

from __future__ import annotations

import hashlib
import hmac
import urllib.error
import urllib.request
from collections.abc import Mapping
from datetime import UTC, datetime
from urllib.parse import quote, urlsplit

from app.core.config import Settings
from app.storage.base import StorageBackend, StorageNotFound, register_storage, validate_key

_ALGORITHM = "AWS4-HMAC-SHA256"


class StorageError(RuntimeError):
    """The storage service failed. The message never includes credentials or object data."""


class S3NotConfigured(ValueError):
    pass


def _hmac(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode(), hashlib.sha256).digest()


def sign(
    *,
    method: str,
    host: str,
    path: str,
    headers: Mapping[str, str],
    payload_sha256: str,
    access_key: str,
    secret_key: str,
    region: str,
    when: datetime,
    query: str = "",
) -> dict[str, str]:
    """Return the request headers with SigV4 `Authorization` added.

    `path` must already be URI-encoded. `headers` are extra headers to sign (lower-case names).
    """
    amz_date = when.strftime("%Y%m%dT%H%M%SZ")
    day = amz_date[:8]
    signed = {
        "host": host,
        "x-amz-content-sha256": payload_sha256,
        "x-amz-date": amz_date,
        **{k.lower(): v.strip() for k, v in headers.items()},
    }
    names = sorted(signed)
    canonical = "\n".join(
        [
            method,
            path,
            query,
            "".join(f"{n}:{signed[n]}\n" for n in names),
            ";".join(names),
            payload_sha256,
        ]
    )
    scope = f"{day}/{region}/s3/aws4_request"
    to_sign = "\n".join(
        [_ALGORITHM, amz_date, scope, hashlib.sha256(canonical.encode()).hexdigest()]
    )
    key = _hmac(
        _hmac(_hmac(_hmac(f"AWS4{secret_key}".encode(), day), region), "s3"), "aws4_request"
    )
    signature = hmac.new(key, to_sign.encode(), hashlib.sha256).hexdigest()
    signed["authorization"] = (
        f"{_ALGORITHM} Credential={access_key}/{scope}, "
        f"SignedHeaders={';'.join(names)}, Signature={signature}"
    )
    return signed


class S3Storage(StorageBackend):
    name = "s3"

    def __init__(self, settings: Settings) -> None:
        missing = [
            env
            for attr, env in (
                ("s3_endpoint_url", "S3_ENDPOINT_URL"),
                ("s3_bucket", "S3_BUCKET"),
                ("s3_access_key_id", "S3_ACCESS_KEY_ID"),
                ("s3_secret_access_key", "S3_SECRET_ACCESS_KEY"),
            )
            if not getattr(settings, attr)
        ]
        if missing:
            raise S3NotConfigured(f"STORAGE_BACKEND=s3 needs {', '.join(missing)}.")
        assert settings.s3_endpoint_url and settings.s3_bucket and settings.s3_secret_access_key
        endpoint = urlsplit(settings.s3_endpoint_url.rstrip("/"))
        if endpoint.scheme not in ("https", "http") or not endpoint.netloc:
            raise S3NotConfigured("S3_ENDPOINT_URL must be an https:// URL.")
        self.scheme = endpoint.scheme
        self.bucket = settings.s3_bucket
        if settings.s3_addressing == "virtual":
            self.host = f"{self.bucket}.{endpoint.netloc}"
            self.base_path = endpoint.path
        else:
            self.host = endpoint.netloc
            self.base_path = f"{endpoint.path}/{quote(self.bucket, safe='')}"
        self.region = settings.s3_region
        self.access_key = settings.s3_access_key_id or ""
        self.secret_key = settings.s3_secret_access_key.get_secret_value()
        self.prefix = settings.s3_prefix.strip("/")
        self.timeout = settings.s3_timeout_seconds

    def _path(self, key: str) -> str:
        full = f"{self.prefix}/{validate_key(key)}" if self.prefix else validate_key(key)
        return f"{self.base_path}/{quote(full, safe='/-_.~')}"

    def _request(self, method: str, key: str, body: bytes = b"") -> tuple[int, bytes]:
        path = self._path(key)
        payload_hash = hashlib.sha256(body).hexdigest()
        extra = {"content-type": "application/octet-stream"} if method == "PUT" else {}
        headers = sign(
            method=method,
            host=self.host,
            path=path,
            headers=extra,
            payload_sha256=payload_hash,
            access_key=self.access_key,
            secret_key=self.secret_key,
            region=self.region,
            when=datetime.now(UTC),
        )
        headers.pop("host")  # urllib sets it from the URL
        req = urllib.request.Request(  # noqa: S310 - scheme checked in __init__
            f"{self.scheme}://{self.host}{path}",
            data=body if method == "PUT" else None,
            method=method,
            headers=headers,
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:  # noqa: S310
                return resp.status, resp.read()
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return 404, b""
            raise StorageError(f"Storage request failed ({method} {exc.code}).") from None
        except (urllib.error.URLError, OSError) as exc:
            raise StorageError(f"Storage is unreachable ({type(exc).__name__}).") from None

    def put(self, key: str, data: bytes) -> None:
        self._request("PUT", key, data)

    def get(self, key: str) -> bytes:
        status, body = self._request("GET", key)
        if status == 404:
            raise StorageNotFound("Stored file not found.")
        return body

    def delete(self, key: str) -> None:
        self._request("DELETE", key)  # S3 answers 204 whether or not the object existed

    def exists(self, key: str) -> bool:
        status, _ = self._request("HEAD", key)
        return status != 404


register_storage("s3", S3Storage)
