#!/usr/bin/env bash
# ── openSME — Stop ─────────────────────
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

echo "🛑 Stopping openSME..."
COMPOSE_FILE="$COMPOSE_FILE" docker compose down
echo "✅ openSME stopped."
