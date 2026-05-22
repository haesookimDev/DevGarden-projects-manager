#!/usr/bin/env bash
# Dump the DevGarden Postgres database to `./infra/backups/`.
#
# Usage:
#   ./infra/backup.sh                    # writes ./infra/backups/<timestamp>.sql.gz
#   ./infra/backup.sh --keep 7           # plus prune older files past N retained
#
# Assumes prod compose is running ("devgarden-postgres" container). Reads
# Postgres credentials from the running container's env (POSTGRES_USER etc.),
# so no need to source .env on the host.

set -euo pipefail

KEEP=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep)
      KEEP="${2:-}"
      shift 2
      ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${INFRA_DIR}/backups"
mkdir -p "$BACKUP_DIR"

CONTAINER="devgarden-postgres"
if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "container '$CONTAINER' is not running — start it with docker compose up -d" >&2
  exit 1
fi

TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR}/devgarden-${TS}.sql.gz"

echo "→ dumping to ${OUT}"
docker exec -i "$CONTAINER" \
  sh -c 'pg_dump --no-owner --no-acl -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  | gzip > "$OUT"

SIZE="$(du -h "$OUT" | cut -f1)"
echo "✓ wrote ${OUT} (${SIZE})"

if [[ -n "$KEEP" ]]; then
  if ! [[ "$KEEP" =~ ^[0-9]+$ ]]; then
    echo "--keep expects an integer, got '${KEEP}'" >&2
    exit 2
  fi
  # Keep the N most-recent dumps; delete the rest.
  KEPT=0
  DELETED=0
  while IFS= read -r file; do
    KEPT=$((KEPT + 1))
    if (( KEPT > KEEP )); then
      rm -f -- "$file"
      DELETED=$((DELETED + 1))
    fi
  done < <(ls -1t "$BACKUP_DIR"/devgarden-*.sql.gz 2>/dev/null)
  if (( DELETED > 0 )); then
    echo "✓ pruned ${DELETED} old backup(s); kept ${KEEP} newest"
  fi
fi
