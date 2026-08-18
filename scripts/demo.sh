#!/usr/bin/env bash
# ── openSME — Demo Launcher ─────────────
# One-command setup for demo / local development.
# Requires: Docker + Docker Compose (v2).
# Starts: Portal, PostgreSQL, Redis, Memcached, Keycloak, OpenCloud.
# Skips: PgBouncer, LDAP, Collabora, Stalwart, SOGo (too heavy for demo).
#
# Usage:
#   ./scripts/demo.sh                    # first run (creates .env)
#   ./scripts/demo.sh --force-env        # regenerate .env with new passwords
#
# Services accessible at http://localhost:8080 (Portal only).
# Keycloak and OpenCloud are routed through Traefik on localhost.
# For a public demo with real HTTPS, see scripts/demo-live.sh.
# ═══════════════════════════════════════════════

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

DOCKER_VERSION=$(docker --version | grep -oP '\d+\.\d+' | head -1)
COMPOSE_VERSION=$(docker compose version --short 2>/dev/null || echo "unknown")
info "Docker ${DOCKER_VERSION}, Compose ${COMPOSE_VERSION}"

# ── Check RAM ─────────────────────────────────
TOTAL_RAM_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo "0")
TOTAL_RAM_GB=$((TOTAL_RAM_KB / 1024 / 1024))
if [ "$TOTAL_RAM_GB" -gt 0 ] && [ "$TOTAL_RAM_GB" -lt 4 ]; then
  warn "Only ${TOTAL_RAM_GB} GB RAM detected. 4 GB minimum recommended."
  warn "The demo may run slowly or fail."
fi

# ── Determine project root ────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

# ── Generate .env if not exists ───────────────
FORCE_ENV=false
if [[ "${1:-}" == "--force-env" ]]; then
  FORCE_ENV=true
  warn "Regenerating .env (--force-env)"
fi

if [[ "$FORCE_ENV" == true ]] || [[ ! -f .env ]]; then
  info "Generating .env with random passwords..."

  pw() { openssl rand -base64 24; }

  # Generate Traefik dashboard password and hash
  TRAEFIK_PASS=$(pw)
  TRAEFIK_HASH=$(printf '%s' "$TRAEFIK_PASS" | openssl passwd -apr1 -stdin 2>/dev/null || printf 'admin:')

  cat > .env <<ENVEOF
# openSME — Local Demo Configuration
OPENSME_DOMAIN=opensme.local
OPENCLOUD_DOMAIN=cloud.opensme.local
KEYCLOAK_DOMAIN=auth.opensme.local
PORTAL_DOMAIN=portal.opensme.local
MAIL_DOMAIN=mail.opensme.local
SOGO_DOMAIN=webmail.opensme.local
COLLABORA_DOMAIN=collabora.opensme.local

# Random passwords
POSTGRES_PASSWORD=$(pw)
KEYCLOAK_DB_PASSWORD=$(pw)
SOGO_DB_PASSWORD=$(pw)
LDAP_ADMIN_PASSWORD=$(pw)
LDAP_USER_PASSWORD=$(pw)
KEYCLOAK_ADMIN_PASSWORD=$(pw)
OC_ADMIN_PASSWORD=$(pw)
OC_OIDC_SECRET=$(pw)
OC_S3_SECRET_KEY=$(pw)
COLLABORA_PASSWORD=$(pw)

# Traefik dashboard
TRAEFIK_USERS=${TRAEFIK_HASH}

LOG_LEVEL=debug
LOG_PRETTY=true
ENVEOF
  ok ".env created with random passwords"
else
  info "Using existing .env"
fi

# ── Build and start ──────────────────────────
# File order matters: overlays first, then demo profile (must be last to win).
info "Building and starting openSME (demo mode)..."

docker compose \
  -f docker-compose.yml \
  -f idm/keycloak.yml \
  -f opencloud/opencloud.yml \
  -f profiles/demo.dev.yml \
  up -d --build

echo ""
ok "openSME Demo is running!"

# ── Get admin password ────────────────────────
ADMIN_PW=$(grep KEYCLOAK_ADMIN_PASSWORD .env | cut -d= -f2)
OC_ADMIN=$(grep OC_ADMIN_PASSWORD .env | cut -d= -f2)

echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}  openSME Demo — Credentials${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
echo -e "  Portal:       ${BLUE}http://localhost:8080${NC}"
echo ""
echo -e "  ${YELLOW}Keycloak Admin:${NC}"
echo -e "    User:     admin"
echo -e "    Password: ${ADMIN_PW}"
echo ""
echo -e "  ${YELLOW}OpenCloud Admin:${NC}"
echo -e "    User:     admin"
echo -e "    Password: ${OC_ADMIN}"
echo ""
echo -e "  ${YELLOW}Traefik Dashboard (if enabled):${NC}"
echo -e "    User:     admin"
echo -e "    Password: ${TRAEFIK_PASS}"
echo ""
echo -e "${GREEN}───────────────────────────────────────────${NC}"
echo ""
info "To stop:   docker compose -f docker-compose.yml -f idm/keycloak.yml -f opencloud/opencloud.yml -f profiles/demo.dev.yml down"
info "To follow: docker compose logs -f"
info "For public HTTPS demo, see scripts/demo-live.sh"
