#!/usr/bin/env bash
# ── openSME — Stop ─────────────────────
# Stops all running opensme containers in the current project.
# Uses 'docker compose down' with the same COMPOSE_FILE that was used
# to start (default: core + zitadel + opencloud), falling back to
# stopping any remaining opensme-* containers.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml:idm/zitadel.yml:opencloud/opencloud.yml}"

echo "🛑 Stopping openSME..."

# Try compose down with the expected files
COMPOSE_FILE="$COMPOSE_FILE" docker compose down --remove-orphans 2>/dev/null || true

# Catch any remaining opensme containers that may have been
# started with a different compose file combination
REMAINING=$(docker ps --filter "name=opensme-" --format '{{.Names}}' 2>/dev/null || true)
if [ -n "$REMAINING" ]; then
  echo "   Stopping leftover containers: ${REMAINING}"
  echo "$REMAINING" | xargs -r docker stop 2>/dev/null || true
  echo "$REMAINING" | xargs -r docker rm 2>/dev/null || true
fi

echo "✅ openSME stopped."
