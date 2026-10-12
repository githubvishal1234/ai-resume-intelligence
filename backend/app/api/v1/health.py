from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated

from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db

router = APIRouter(prefix="/health", tags=["health"])


class LiveOut(BaseModel):
    status: str


@router.get("/live", response_model=LiveOut)
def live() -> LiveOut:
    """Process is up. Does not touch dependencies."""
    return LiveOut(status="ok")


ALEMBIC_INI = Path(__file__).resolve().parents[3] / "alembic.ini"


@lru_cache(maxsize=1)
def migration_heads() -> frozenset[str]:
    """The revisions this build expects the database to be at."""
    return frozenset(ScriptDirectory.from_config(Config(str(ALEMBIC_INI))).get_heads())


@router.get("/ready", response_model=None)
def ready(db: Annotated[Session, Depends(get_db)]) -> JSONResponse:
    """Dependencies reachable and the schema migrated. Returns 503 without leaking details.

    A deploy that skipped `alembic upgrade head` reports `"migrations": "pending"`, so a load
    balancer keeps traffic on the previous version instead of serving errors.
    """
    try:
        db.execute(text("select 1"))
    except Exception:
        return JSONResponse(status_code=503, content={"status": "unavailable", "database": "down"})
    try:
        current = frozenset(db.execute(text("select version_num from alembic_version")).scalars())
    except Exception:
        current = frozenset()
    if current != migration_heads():
        return JSONResponse(
            status_code=503,
            content={"status": "unavailable", "database": "up", "migrations": "pending"},
        )
    return JSONResponse(content={"status": "ok", "database": "up", "migrations": "current"})
