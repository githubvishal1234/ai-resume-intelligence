"""Profile photo: one per user, shown only by photo templates and never required.

Uploads are decoded and re-encoded as a 600 px square JPEG, so what is stored is always a plain
image: no EXIF (camera, GPS location), no scripts, no other formats. It lives in the configured
storage under a key derived from the user id, and is deleted with the account.
"""

from __future__ import annotations

import io
import uuid

from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.errors import AppError
from app.storage.base import StorageBackend, StorageNotFound

MAX_PHOTO_BYTES = 5 * 1024 * 1024
SIZE = 600
# Refuses decompression bombs: a small file that expands to a huge image.
Image.MAX_IMAGE_PIXELS = 40_000_000


class PhotoInvalid(AppError):
    status_code = 422
    code = "PHOTO_INVALID"
    message = "Upload a JPEG, PNG or WebP image of at most 5 MB."


def photo_key(user_id: uuid.UUID) -> str:
    return f"photos/{user_id}.jpg"


def normalise(data: bytes) -> bytes:
    """A square, upright, metadata-free JPEG from an uploaded image, or PhotoInvalid."""
    if not data or len(data) > MAX_PHOTO_BYTES:
        raise PhotoInvalid()
    try:
        with Image.open(io.BytesIO(data)) as im:
            if im.format not in ("JPEG", "PNG", "WEBP"):
                raise PhotoInvalid()
            square = ImageOps.fit(ImageOps.exif_transpose(im).convert("RGB"), (SIZE, SIZE))
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, ValueError) as exc:
        raise PhotoInvalid() from exc
    out = io.BytesIO()
    square.save(out, format="JPEG", quality=88)
    return out.getvalue()


def load_photo(storage: StorageBackend, user_id: uuid.UUID) -> bytes | None:
    try:
        return storage.get(photo_key(user_id))
    except StorageNotFound:
        return None
