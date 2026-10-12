"""Storage abstraction. Production storage is configurable (Decision Register D-06).

Keys are server-generated identifiers, never user-supplied filenames.
"""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from collections.abc import Callable

from app.core.config import Settings

_KEY_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$")


class InvalidStorageKey(ValueError):
    pass


class StorageNotFound(FileNotFoundError):
    pass


def validate_key(key: str) -> str:
    if not _KEY_RE.match(key) or ".." in key.split("/") or "//" in key or key.endswith("/"):
        raise InvalidStorageKey("Invalid storage key.")
    return key


class StorageBackend(ABC):
    name: str

    @abstractmethod
    def put(self, key: str, data: bytes) -> None: ...

    @abstractmethod
    def get(self, key: str) -> bytes: ...

    @abstractmethod
    def delete(self, key: str) -> None: ...

    @abstractmethod
    def exists(self, key: str) -> bool: ...


_REGISTRY: dict[str, Callable[[Settings], StorageBackend]] = {}


def register_storage(name: str, factory: Callable[[Settings], StorageBackend]) -> None:
    _REGISTRY[name.lower()] = factory


def get_storage(settings: Settings) -> StorageBackend:
    name = settings.storage_backend.lower()
    if name not in _REGISTRY:
        raise ValueError(f"Unknown STORAGE_BACKEND '{name}'. Registered: {sorted(_REGISTRY)}")
    return _REGISTRY[name](settings)
