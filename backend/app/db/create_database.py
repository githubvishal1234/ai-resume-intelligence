"""Creates the database named in DATABASE_URL if it doesn't exist yet.

    python -m app.db.create_database

SQL Server has no "create on connect", so a fresh server (CI, Docker, a new environment) needs
this once before `alembic upgrade head`. It connects to `master` with the same login.
"""

from __future__ import annotations

import re

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from app.core.config import get_settings


def create_database(url: str) -> bool:
    """True when the database was created, False when it already existed."""
    target = make_url(url)
    name = target.database or ""
    if not re.fullmatch(r"[A-Za-z0-9_]{1,128}", name):
        raise ValueError(f"Refusing an unusual database name: {name!r}")
    engine = create_engine(target.set(database="master"), isolation_level="AUTOCOMMIT")
    try:
        with engine.connect() as conn:
            if conn.execute(text("SELECT DB_ID(:n)"), {"n": name}).scalar() is not None:
                return False
            conn.execute(text(f"CREATE DATABASE [{name}]"))
            return True
    finally:
        engine.dispose()


if __name__ == "__main__":
    url = get_settings().database_url
    created = create_database(url)
    print(f"{make_url(url).database}: {'created' if created else 'already exists'}")
