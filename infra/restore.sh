#!/usr/bin/env bash
# Restore a DevGarden Postgres dump produced by `backup.sh`.
#
# Usage:
#   ./infra/restore.sh ./infra/backups/devgarden-20260521T120000Z.sql.gz
#
# DESTRUCTIVE: drops the existing schema and recreates from the dump. Requires
# an explicit `CONFIRM=yes` env var or `--yes` flag to avoid accidents.

set -euo pipefail

FORCE=""
DUMP=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y)
      FORCE="yes"
      shift
      ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      DUMP="$1"
      shift
      ;;
  esac
done

if [[ -z "$DUMP" ]]; then
  echo "usage: $0 [--yes] <path-to-.sql.gz>" >&2
  exit 2
fi
if [[ ! -f "$DUMP" ]]; then
  echo "no such file: $DUMP" >&2
  exit 1
fi

CONTAINER="devgarden-postgres"
if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "container '$CONTAINER' is not running" >&2
  exit 1
fi

if [[ -z "$FORCE" && "${CONFIRM:-}" != "yes" ]]; then
  echo "this will DROP and recreate the public schema in the running database."
  echo "rerun with --yes or CONFIRM=yes to proceed."
  exit 1
fi

echo "→ restoring from ${DUMP}"
gunzip -c "$DUMP" | docker exec -i "$CONTAINER" \
  sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$POSTGRES_DB" \
         -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;" \
         && psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$POSTGRES_DB"'

echo "✓ restore complete"
echo "  next: restart the api container so Prisma reconnects:"
echo "    docker compose -f infra/docker-compose.yml restart api"
