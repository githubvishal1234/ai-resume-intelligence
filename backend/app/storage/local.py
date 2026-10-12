from __future__ import annotations

import os
import tempfile
from pathlib import Path

from app.storage.base import StorageBackend, StorageNotFound, register_storage, validate_key


class LocalStorage(StorageBackend):
    """Filesystem storage for development and single-host deployments."""

    name = "local"

    def __init__(self, root: str | Path) -> None:
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        path = (self.root / validate_key(key)).resolve()
        if not path.is_relative_to(self.root):  # defence in depth against traversal / symlinks
            raise StorageNotFound("Invalid storage key.")
        return path

    def put(self, key: str, data: bytes) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=path.parent)
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(data)
            os.replace(tmp, path)  # atomic
        except BaseException:
            Path(tmp).unlink(missing_ok=True)
            raise

    def get(self, key: str) -> bytes:
        path = self._path(key)
        if not path.is_file():
            raise StorageNotFound(key)
        return path.read_bytes()

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)

    def exists(self, key: str) -> bool:
        return self._path(key).is_file()


register_storage("local", lambda s: LocalStorage(s.storage_local_root))
