#!/usr/bin/env bash
# ── openSME — Start ────────────────────
# Starts all configured services using COMPOSE_FILE.
# Defaults to core + zitadel + opencloud.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

DEFAULT_FILES="docker-compose.yml:idm/zitadel.yml:opencloud/opencloud.yml"
COMPOSE_FILE="${COMPOSE_FILE:-$DEFAULT_FILES}"

echo "🚀 Starting openSME..."
echo "   Compose file(s): ${COMPOSE_FILE}"

docker compose up -d

echo ""
echo "✅ openSME is starting up."
