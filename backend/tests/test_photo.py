from __future__ import annotations

import io
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import text

from app.core.config import Settings
from app.db.session import get_engine
from tests.conftest import STRONG_PASSWORD, login_as
from tests.test_resumes import import_and_confirm

API = "/api/v1/account/photo"


def _image(fmt: str = "PNG", size: tuple[int, int] = (800, 500), exif: bool = False) -> bytes:
    im = Image.new("RGB", size, (30, 120, 90))
    out = io.BytesIO()
    if exif:
        data = Image.Exif()
        data[0x010F] = "SpyCam"  # camera make
        im.save(out, format=fmt, exif=data)
    else:
        im.save(out, format=fmt)
    return out.getvalue()


def _put(client: TestClient, data: bytes, name: str = "me.png") -> Any:
    return client.put(API, files={"file": (name, data)})


def test_upload_is_re_encoded_as_a_square_jpeg_without_metadata(user_client: TestClient) -> None:
    assert user_client.get(API).status_code == 204
    assert _put(user_client, _image("JPEG", exif=True), "me.jpg").status_code == 204
    got = user_client.get(API)
    assert got.status_code == 200 and got.headers["content-type"] == "image/jpeg"
    with Image.open(io.BytesIO(got.content)) as im:
        assert (im.format, im.size) == ("JPEG", (600, 600))
        assert not im.getexif()  # the camera make (and any GPS) is gone
    assert user_client.delete(API).status_code == 204
    assert user_client.get(API).status_code == 204


def test_only_real_jpeg_png_or_webp_images_are_accepted(user_client: TestClient) -> None:
    for data in (b"<svg onload=alert(1)>", b"not an image", _image("GIF"), b""):
        response = _put(user_client, data)
        assert response.status_code == 422 and response.json()["code"] == "PHOTO_INVALID"
    too_big = _image("PNG") + b"\0" * (5 * 1024 * 1024)
    assert _put(user_client, too_big).status_code == 422


def test_each_user_sees_only_their_own_photo(app: FastAPI, user_client: TestClient) -> None:
    assert _put(user_client, _image()).status_code == 204
    other = login_as(app, "eve@example.com")
    assert other.get(API).status_code == 204


def test_photo_templates_draw_it_and_the_ats_check_notes_it(user_client: TestClient) -> None:
    resume = import_and_confirm(user_client)
    url = f"/api/v1/resumes/{resume['id']}"
    plain = user_client.get(f"{url}/export.pdf", params={"template": "portrait-teal"}).content
    assert b"/Subtype /Image" not in plain  # no photo uploaded: nothing drawn

    assert _put(user_client, _image()).status_code == 204
    with_photo = user_client.get(f"{url}/export.pdf", params={"template": "portrait-teal"})
    assert b"/Subtype /Image" in with_photo.content
    other = user_client.get(f"{url}/export.pdf", params={"template": "classic"}).content
    assert b"/Subtype /Image" not in other  # templates without a photo never include it

    checks = {
        c["id"]: c["status"]
        for c in user_client.get(f"{url}/ats", params={"template": "portrait-teal"}).json()[
            "checks"
        ]
    }
    assert checks["photo.included"] == "warn"
    sidebar = user_client.get(f"{url}/ats", params={"template": "sidebar-teal"}).json()["checks"]
    assert {c["id"]: c["status"] for c in sidebar}["layout.columns"] == "warn"
    single = user_client.get(f"{url}/ats", params={"template": "classic"}).json()["checks"]
    assert not {"photo.included", "layout.columns"} & {c["id"] for c in single}


def test_account_deletion_removes_the_photo(user_client: TestClient, settings: Settings) -> None:
    assert _put(user_client, _image()).status_code == 204
    with get_engine().connect() as conn:
        user_id = conn.scalar(text("select id from users where email = 'ada@example.com'"))
    stored = Path(settings.storage_local_root) / f"photos/{user_id}.jpg"
    assert stored.is_file()
    gone = user_client.post("/api/v1/account/delete", json={"password": STRONG_PASSWORD})
    assert gone.status_code == 204
    assert not stored.exists()
