#!/usr/bin/env bash
# ── openSME — Backup ───────────────────
# Backs up PostgreSQL (all databases) via docker exec.
# Persistent Docker volumes can be backed up via:
#   docker run --rm -v <src_vol>:/data -v $(pwd)/backups:/backup \
#     alpine tar czf /backup/vol_<timestamp>.tar.gz /data
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

# Read active compose file (default: core + zitadel + opencloud)
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml:idm/zitadel.yml:opencloud/opencloud.yml}"
export COMPOSE_FILE

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "📦 Backing up openSME to ${BACKUP_DIR}/"

# PostgreSQL dump
echo "   → PostgreSQL..."
docker compose exec -T postgres pg_dumpall -U opensme \
  | gzip > "${BACKUP_DIR}/postgres_${TIMESTAMP}.sql.gz"

echo ""
echo "✅ Backup complete: ${BACKUP_DIR}/"
ls -lh "${BACKUP_DIR}/postgres_${TIMESTAMP}.sql.gz"
