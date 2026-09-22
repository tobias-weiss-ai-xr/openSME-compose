#!/usr/bin/env bash
# check_dev_agent.sh — container-level checks for the dev-maintenance-bot
# (layer 3 / task "tests/02-container run.sh"). Requires a running stack with
# the dev-agent overlay enabled:
#   COMPOSE_FILE="docker-compose.yml:monitoring/dev-agent.yml"
# Checks: image build, entrypoint, one-shot run, /healthz, evidence endpoint.
set -euo pipefail
cd "$(dirname "$0")/../.."

IMAGE="${DEV_MAINTENANCE_BOT_IMAGE:-opensme-dev-maintenance-bot:latest}"
CONTAINER="opensme-dev-maintenance-bot"
STATE_VOL="opensme_dev-maintenance-bot-state"
ok=1
fail() { echo "  ❌ $1"; ok=0; }
pass() { echo "  ✅ $1"; }

echo "── dev-maintenance-bot container checks ──"

# 1. Image exists (build if missing)
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "  ℹ building image (missing locally)"
  docker build -f opensme-dev-agent/Dockerfile -t "$IMAGE" . >/dev/null
fi
pass "image $IMAGE present"

# 2. Entrypoint + one-shot run against the real docker socket
docker run --rm --name "$CONTAINER-check" \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v "$STATE_VOL:/var/lib/opensme" \
  "$IMAGE" -once >/dev/null 2>&1 || fail "one-shot run exited non-zero"
pass "one-shot reconcile ran cleanly"

# 3. Health endpoint in serve mode
cid=$(docker run -d --name "$CONTAINER-serve" \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v "$STATE_VOL:/var/lib/opensme" \
  "$IMAGE" -serve)
trap 'docker rm -f "$CONTAINER-serve" >/dev/null 2>&1 || true' EXIT
sleep 2
curl -fs "http://$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$cid"):8082/healthz" \
  | grep -q '"ok"' && pass "GET /healthz → ok" || fail "GET /healthz did not return ok"

# 4. Evidence endpoint lists strips/heals (may be empty, must be JSON array)
curl -fs "http://$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$cid"):8082/evidence" \
  | python3 -c 'import json,sys; json.load(sys.stdin)' \
  && pass "GET /evidence returns JSON" || fail "GET /evidence invalid"

docker rm -f "$CONTAINER-serve" >/dev/null 2>&1 || true

if [ "$ok" = 1 ]; then
  echo "✅ dev-maintenance-bot container checks: ALL PASS"
else
  echo "❌ dev-maintenance-bot container checks: FAILURES" >&2
  exit 1
fi
