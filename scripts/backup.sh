#!/usr/bin/env bash
# ── openSME — Backup ───────────────────
# Backs up PostgreSQL (all databases) and Traefik ACME/SSL data.
# Persistent Docker volumes (opencloud-data, minio-data, etc.) can be
# backed up via:
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

# Traefik data (ACME certs, dynamic config)
echo "   → Traefik (ACME certs + config)..."
docker compose run --rm --no-deps --entrypoint "" \
  -v "$(pwd)/${BACKUP_DIR}:/backup" \
  traefik tar czf "/backup/traefik_${TIMESTAMP}.tar.gz" -C /etc/traefik . 2>/dev/null \
  || echo "   ⚠ Traefik backup skipped (not running or no volume)"

echo ""
echo "✅ Backup complete: ${BACKUP_DIR}/"
ls -lh "${BACKUP_DIR}/"*"_${TIMESTAMP}.*"
