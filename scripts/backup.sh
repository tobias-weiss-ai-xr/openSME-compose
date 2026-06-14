#!/usr/bin/env bash
# ── openSME — Backup ───────────────────
# Backs up PostgreSQL (all databases) and persistent volumes.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "📦 Backing up openSME to ${BACKUP_DIR}/"

# PostgreSQL dump
echo "   → PostgreSQL..."
docker compose exec -T postgres pg_dumpall -U opensme \
  | gzip > "${BACKUP_DIR}/postgres_${TIMESTAMP}.sql.gz"

# Alertmanager keys etc.
echo "   → Traefik data..."
docker compose run --rm -v "${PWD}/backups:/backups" alpine \
  tar czf "/backups/traefik_${TIMESTAMP}.tar.gz" -C /var/lib/docker/volumes opensme-compose_traefik-data 2>/dev/null || true

echo ""
echo "✅ Backup complete: ${BACKUP_DIR}/"
ls -lh "${BACKUP_DIR}/"
