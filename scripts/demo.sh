#!/usr/bin/env bash
# ── openSME — Demo Launcher ─────────────
# One-command setup for demo / local development.
# Requires: Docker + Docker Compose (v2).
# Starts: Portal, PostgreSQL, Redis, Memcached, Zitadel, OpenCloud.
# Skips: PgBouncer, Collabora, Stalwart, SOGo (too heavy for demo).
#
# Usage:
#   ./scripts/demo.sh                    # first run (creates .env)
#   ./scripts/demo.sh --force-env        # regenerate .env with new passwords
#
# Services accessible at http://localhost:8080 (Portal only).
# Zitadel and OpenCloud are routed through Traefik on localhost.
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
  # Compose interpolates $ inside .env values — escape $ → $$ so the
  # apr1 hash ($apr1$salt$hash) survives; compose unescapes it again
  # when injecting the variable into containers.
  TRAEFIK_HASH_ESC=${TRAEFIK_HASH//\$/\$\$}

  # Write to a temp file first, then move into place — a failed generation
  # must not leave a truncated .env that poisons subsequent runs
  # ("using existing .env" would then boot with compose defaults).
  env_tmp=$(mktemp)
  cat > "$env_tmp" <<ENVEOF
# openSME — Local Demo Configuration
OPENSME_DOMAIN=opensme.local
OPENCLOUD_DOMAIN=cloud.opensme.local
ZITADEL_DOMAIN=auth.opensme.local
IDP_URL=https://auth.opensme.local
PORTAL_DOMAIN=portal.opensme.local
MAIL_DOMAIN=mail.opensme.local
SOGO_DOMAIN=webmail.opensme.local
COLLABORA_DOMAIN=collabora.opensme.local

# Random passwords
POSTGRES_PASSWORD=$(pw)
ZITADEL_DB_PASSWORD=$(pw)
SOGO_DB_PASSWORD=$(pw)
LDAP_ADMIN_PASSWORD=$(pw)
LDAP_USER_PASSWORD=$(pw)
ZITADEL_ADMIN_PASSWORD=$(pw)
OC_ADMIN_PASSWORD=$(pw)
OC_OIDC_SECRET=$(pw)
OC_S3_SECRET_KEY=$(pw)
COLLABORA_PASSWORD=$(pw)

# Traefik dashboard
TRAEFIK_USERS=${TRAEFIK_HASH_ESC}

LOG_LEVEL=debug
LOG_PRETTY=true
ENVEOF
  mv "$env_tmp" .env
  ok ".env created with random passwords"
else
  info "Using existing .env"
fi

# ── Provision deploy-time Zitadel artifacts ─
# Both are gitignored and normally created by the ansible deploy role.
# The masterkey must be exactly 32 bytes with no trailing newline.
if [[ ! -s idm/secrets/masterkey ]]; then
  mkdir -p idm/secrets
  printf '%s' "$(openssl rand -base64 24)" > idm/secrets/masterkey
  ok "Generated idm/secrets/masterkey"
fi
if [[ ! -x idm/zitadel/busybox ]]; then
  mkdir -p idm/zitadel
  cid=$(docker create busybox:stable-musl true)
  docker cp "$cid":/bin/busybox idm/zitadel/busybox
  docker rm "$cid" >/dev/null
  chmod +x idm/zitadel/busybox
  ok "Extracted busybox for the Zitadel healthcheck"
fi

# ── Initialize Zitadel (fresh installs) ─────
# The service command is plain `start`; on a fresh database it needs the
# one-time `init` + `setup` (idempotent — safe on every run) which also
# seeds the automation machine user and writes its PATs into the
# zitadel-machinekey volume (used by tests/05-e2e).
CF="-f docker-compose.yml -f idm/zitadel.yml -f opencloud/opencloud.yml -f profiles/demo.dev.yml"
info "Waiting for PostgreSQL..."
docker compose $CF up -d postgres >/dev/null 2>&1
for _ in $(seq 1 60); do
  docker compose $CF ps --format json postgres 2>/dev/null | grep -qi '"health":"healthy"' && break
  sleep 5
done
info "Running Zitadel init + setup (idempotent)..."
docker compose $CF run --rm zitadel init
# --user 0:0: a freshly created named volume is root-owned and the
# distroless image runs as uid 1000 — without this the PAT files cannot
# be created on a first-ever run. Files land 0644 (world-readable).
if ! docker compose $CF run --rm --user 0:0 zitadel setup --masterkeyFile /secrets/masterkey --steps /steps.yaml; then
  err "Zitadel setup failed — check the logs above"
  exit 1
fi

# ── Build and start ──────────────────────────
# File order matters: overlays first, then demo profile (must be last to win).
info "Building and starting openSME (demo mode)..."

docker compose \
  -f docker-compose.yml \
  -f idm/zitadel.yml \
  -f opencloud/opencloud.yml \
  -f profiles/demo.dev.yml \
  --profile standalone \
  up -d --build

echo ""
ok "openSME Demo is running!"

# ── Get admin password ────────────────────────
ADMIN_PW=$(grep ZITADEL_ADMIN_PASSWORD .env | cut -d= -f2)
OC_ADMIN=$(grep OC_ADMIN_PASSWORD .env | cut -d= -f2)
TRAEFIK_HASH=$(grep TRAEFIK_USERS .env | cut -d= -f2-)
TRAEFIK_PASS_DISPLAY="(see .env — TRAEFIK_USERS hash)"
if [[ -n "${TRAEFIK_PASS:-}" ]]; then
  TRAEFIK_PASS_DISPLAY="${TRAEFIK_PASS}"
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}  openSME Demo — Credentials${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
echo -e "  Portal:       ${BLUE}http://localhost:8080${NC}"
echo ""
echo -e "  ${YELLOW}Zitadel Admin:${NC}"
echo -e "    User:     admin"
echo -e "    Password: ${ADMIN_PW}"
echo ""
echo -e "  ${YELLOW}OpenCloud Admin:${NC}"
echo -e "    User:     admin"
echo -e "    Password: ${OC_ADMIN}"
echo ""
echo -e "  ${YELLOW}Traefik Dashboard (if enabled):${NC}"
echo -e "    User:     admin"
echo -e "    Password: ${TRAEFIK_PASS_DISPLAY}"
echo ""
echo -e "${GREEN}───────────────────────────────────────────${NC}"
echo ""
info "To stop:   docker compose -f docker-compose.yml -f idm/zitadel.yml -f opencloud/opencloud.yml -f profiles/demo.dev.yml down"
info "To follow: docker compose logs -f"
info "For public HTTPS demo, see scripts/demo-live.sh"
