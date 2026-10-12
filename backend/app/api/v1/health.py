from __future__ import annotations

from typing import Annotated

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


@router.get("/ready", response_model=None)
def ready(db: Annotated[Session, Depends(get_db)]) -> JSONResponse:
    """Dependencies reachable. Returns 503 without leaking error details."""
    try:
        db.execute(text("select 1"))
    except Exception:
        return JSONResponse(status_code=503, content={"status": "unavailable", "database": "down"})
    return JSONResponse(content={"status": "ok", "database": "up"})
