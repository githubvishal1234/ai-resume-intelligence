#!/usr/bin/env bash
# Restore a backup made by backup.sh into an EMPTY database (and storage folder).
#
#   DATABASE_URL=postgresql://user:pass@host:5432/resume_intel_restore \
#   STORAGE_LOCAL_ROOT=/app/var/storage ./scripts/restore.sh /backups/20261012T060000Z
#
# Refuses to restore into a database that already has tables, so it cannot overwrite live
# data by accident. Verify with GET /api/v1/health/ready afterwards.
set -euo pipefail

SOURCE="${1:?usage: restore.sh <backup folder>}"
: "${DATABASE_URL:?set DATABASE_URL}"
STORAGE_LOCAL_ROOT="${STORAGE_LOCAL_ROOT:-}"
PG_URL="${DATABASE_URL/postgresql+psycopg:/postgresql:}"

(cd "$SOURCE" && sha256sum --check --quiet SHA256SUMS)

tables=$(psql "$PG_URL" -tAc "select count(*) from information_schema.tables where table_schema = 'public'")
if [[ "$tables" != "0" ]]; then
  echo "refusing to restore: the target database already has $tables tables" >&2
  exit 1
fi

pg_restore --no-owner --no-privileges --exit-on-error --dbname="$PG_URL" "$SOURCE/database.dump"
if [[ -f "$SOURCE/storage.tar.gz" ]]; then
  : "${STORAGE_LOCAL_ROOT:?set STORAGE_LOCAL_ROOT to restore uploaded files}"
  mkdir -p "$STORAGE_LOCAL_ROOT"
  if [[ -n "$(ls -A "$STORAGE_LOCAL_ROOT")" ]]; then
    echo "refusing to restore files: $STORAGE_LOCAL_ROOT is not empty" >&2
    exit 1
  fi
  tar -C "$STORAGE_LOCAL_ROOT" -xzf "$SOURCE/storage.tar.gz"
fi
echo "restored $SOURCE"
