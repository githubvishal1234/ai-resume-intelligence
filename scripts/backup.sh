#!/usr/bin/env bash
# Back up the database and the upload storage into one timestamped folder.
#
#   DATABASE_URL=postgresql://user:pass@host:5432/resume_intel \
#   STORAGE_LOCAL_ROOT=/app/var/storage BACKUP_DIR=/backups ./scripts/backup.sh
#
# Keeps the newest $BACKUP_KEEP backups (default 14). Exits non-zero on any failure, so a
# scheduler can alert. See docs/DEPLOYMENT.md (Backups).
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL}"
: "${BACKUP_DIR:?set BACKUP_DIR}"
STORAGE_LOCAL_ROOT="${STORAGE_LOCAL_ROOT:-}"
BACKUP_KEEP="${BACKUP_KEEP:-14}"

# pg_dump does not understand SQLAlchemy's "+psycopg" driver suffix.
PG_URL="${DATABASE_URL/postgresql+psycopg:/postgresql:}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$BACKUP_DIR/$STAMP"
umask 077
mkdir -p "$TARGET"

pg_dump --format=custom --no-owner --no-privileges --file="$TARGET/database.dump" "$PG_URL"
if [[ -n "$STORAGE_LOCAL_ROOT" && -d "$STORAGE_LOCAL_ROOT" ]]; then
  tar -C "$STORAGE_LOCAL_ROOT" -czf "$TARGET/storage.tar.gz" .
fi
(cd "$TARGET" && sha256sum ./* > SHA256SUMS)
echo "backup written to $TARGET"

# Retention: delete the oldest folders beyond BACKUP_KEEP (names sort by time).
mapfile -t all < <(find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20*Z' | sort)
excess=$(( ${#all[@]} - BACKUP_KEEP ))
for (( i = 0; i < excess; i++ )); do
  rm -rf -- "${all[$i]}"
  echo "removed old backup ${all[$i]}"
done
