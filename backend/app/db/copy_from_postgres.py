"""One-time copy of every row from the old PostgreSQL database into SQL Server.

    pip install "psycopg[binary]"            # only needed for this copy
    set SOURCE_DATABASE_URL=postgresql+psycopg://resume_app:...@localhost:5432/resume_intel
    set DATABASE_URL=mssql+pyodbc://...       # the new database, already at `alembic upgrade head`
    python -m app.db.copy_from_postgres

Tables are copied in foreign-key order with their ids unchanged, then the row counts of both
sides are compared. The target must be empty: the copy refuses to mix into existing data.
"""

from __future__ import annotations

import os
import sys
from collections.abc import Iterator
from typing import Any

from sqlalchemy import Table, create_engine, func, insert, select
from sqlalchemy.engine import Connection

import app.models  # noqa: F401  (register every table)
from app.core.config import get_settings
from app.db.base import Base

BATCH = 500


def _rows(source: Connection, table: Table) -> Iterator[list[dict[str, Any]]]:
    query = select(*table.columns)
    if table.name == "resumes":
        # Masters before the tailored copies that point at them.
        query = query.order_by(table.c.master_resume_id.is_not(None))
    result = source.execute(query).mappings()
    while chunk := result.fetchmany(BATCH):
        yield [dict(row) for row in chunk]


def copy(source_url: str, target_url: str) -> dict[str, int]:
    source_engine = create_engine(source_url)
    target_engine = create_engine(target_url, deprecate_large_types=True)
    tables = Base.metadata.sorted_tables
    counts: dict[str, int] = {}
    with source_engine.connect() as source, target_engine.begin() as target:
        busy = [t.name for t in tables if target.scalar(select(func.count()).select_from(t))]
        if busy:
            raise SystemExit(
                f"Target already has rows in: {', '.join(busy)}. Use an empty database."
            )
        for table in tables:
            copied = 0
            for batch in _rows(source, table):
                target.execute(insert(table), batch)
                copied += len(batch)
            counts[table.name] = copied
            print(f"{table.name:<24} {copied:>7} rows")
        for table in tables:  # same counts on both sides, checked before committing
            want = source.scalar(select(func.count()).select_from(table))
            got = target.scalar(select(func.count()).select_from(table))
            if want != got:
                raise SystemExit(f"{table.name}: {want} rows in Postgres but {got} copied")
    source_engine.dispose()
    target_engine.dispose()
    return counts


if __name__ == "__main__":
    source_url = os.environ.get("SOURCE_DATABASE_URL", "")
    if not source_url.startswith("postgresql"):
        sys.exit("Set SOURCE_DATABASE_URL to the old postgresql+psycopg://... database.")
    counts = copy(source_url, get_settings().database_url)
    print(f"Done: {sum(counts.values())} rows in {len(counts)} tables, counts verified.")
