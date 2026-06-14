#!/usr/bin/env bash
# ── openSME — Demo Launcher ─────────────
# One-command setup for demo / local development.
# Requires: Docker + Docker Compose (v2).
# Starts: Portal, PostgreSQL, Redis, Memcached, Keycloak, OpenCloud.
# Skips: PgBouncer, Collabora, Stalwart, SOGo (too heavy for demo).
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/tobias-weiss-ai-xr/opensme/main/scripts/demo.sh | bash
#   # OR locally:
#   ./scripts/demo.sh
# ═══════════════════════════════════════════════

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}   $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()   { echo -e "${RED}[ERR]${NC}  $1"; }

# ── Prerequisites ─────────────────────────────
info "Checking prerequisites..."

if ! command -v docker &>/dev/null; then
  err "Docker not found. Install Docker first: https://docs.docker.com/engine/install/"
  exit 1
fi

if ! docker compose version &>/dev/null; then
  err "Docker Compose v2 not found. Install: https://docs.docker.com/compose/install/"
  exit 1
fi

DOCKER_VERSION=$(docker --version | grep -oP '\d+\.\d+\.\d+' | head -1)
COMPOSE_VERSION=$(docker compose version --short 2>/dev/null || echo "unknown")
info "Docker ${DOCKER_VERSION}, Compose ${COMPOSE_VERSION}"

# ── Check RAM ─────────────────────────────────
TOTAL_RAM=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo "0")
TOTAL_RAM_GB=$((TOTAL_RAM / 1024 / 1024))
if [ "$TOTAL_RAM_GB" -gt 0 ] && [ "$TOTAL_RAM_GB" -lt 4 ]; then
  warn "Only ${TOTAL_RAM_GB} GB RAM detected. 4 GB minimum recommended."
  warn "The demo may run slowly or fail."
fi

# ── Determine project root ────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

# ── Generate .env if not exists ───────────────
if [ -f .env ]; then
  info "Using existing .env"
else
  info "Generating .env with random passwords..."
  cat > .env <<ENVEOF
# openSME — Demo Configuration
OPENSME_DOMAIN=opensme.local
OPENCLOUD_DOMAIN=cloud.opensme.local
KEYCLOAK_DOMAIN=auth.opensme.local
PORTAL_DOMAIN=portal.opensme.local

# Random passwords
POSTGRES_PASSWORD=$(openssl rand -base64 24)
KEYCLOAK_DB_PASSWORD=$(openssl rand -base64 24)
SOGO_DB_PASSWORD=$(openssl rand -base64 24)
LDAP_ADMIN_PASSWORD=$(openssl rand -base64 24)
KEYCLOAK_ADMIN_PASSWORD=$(openssl rand -base64 24)
OC_ADMIN_PASSWORD=$(openssl rand -base64 24)
OC_OIDC_SECRET=$(openssl rand -base64 32)
OC_S3_SECRET_KEY=$(openssl rand -base64 24)
COLLABORA_PASSWORD=$(openssl rand -base64 24)

LOG_LEVEL=debug
LOG_PRETTY=true
COMPOSE_FILE=docker-compose.yml:profiles/demo.dev.yml
ENVEOF
  ok ".env created with random passwords"
fi

# ── Build and start ──────────────────────────
info "Building and starting openSME (demo mode)..."
info "  Compose: docker-compose.yml + profiles/demo.dev.yml"
echo ""

# Export compose file for the session
export COMPOSE_FILE="docker-compose.yml:profiles/demo.dev.yml:idm/keycloak.yml:opencloud/opencloud.yml"

info "Starting Portal, PostgreSQL, Redis, Keycloak, OpenCloud..."
docker compose up -d --build

echo ""
ok "openSME Demo is running!"
echo ""

# ── Get admin password ────────────────────────
ADMIN_PW=$(grep KEYCLOAK_ADMIN_PASSWORD .env | cut -d= -f2)
OC_ADMIN=$(grep OC_ADMIN_PASSWORD .env | cut -d= -f2)
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}  openSME Demo — Zugangsdaten${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
echo -e "  Portal:       ${BLUE}http://localhost:8080${NC}"
echo -e "  Keycloak:     ${BLUE}http://localhost:8081${NC}"
echo -e "  OpenCloud:    ${BLUE}http://localhost:8082${NC}"
echo ""
echo -e "  ${YELLOW}Admin Login (Keycloak):${NC}"
echo -e "    User:     admin"
echo -e "    Password: ${ADMIN_PW}"
echo ""
echo -e "  ${YELLOW}OpenCloud Admin:${NC}"
echo -e "    User:     admin"
echo -e "    Password: ${OC_ADMIN}"
echo ""
echo -e "${GREEN}───────────────────────────────────────────${NC}"
echo ""
info "To stop:   docker compose down"
info "To follow: docker compose logs -f"
info ""
info "For production, see README.md → Hardware Recommendations"
