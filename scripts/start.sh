#!/usr/bin/env bash
# ── openSME — Start ────────────────────
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

# Default: core + keycloak + opencloud
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml:idm/keycloak.yml:opencloud/opencloud.yml}"

echo "🚀 Starting openSME..."
echo "   Compose file(s): ${COMPOSE_FILE}"

COMPOSE_FILE="$COMPOSE_FILE" docker compose up -d

echo ""
echo "✅ openSME is starting up."
echo "   Endpoints:"
echo "   - Portal:       https://portal.${OPENSME_DOMAIN:-opensme.org}"
echo "   - Keycloak:     https://${KEYCLOAK_DOMAIN:-auth.opensme.org}"
echo "   - Traefik:      https://traefik.${OPENSME_DOMAIN:-opensme.org}"
echo "   - OpenCloud:    https://${OPENCLOUD_DOMAIN:-cloud.opensme.org}"
