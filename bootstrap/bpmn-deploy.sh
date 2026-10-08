#!/usr/bin/env bash
# bootstrap/bpmn-deploy.sh — deploy seed BPMN processes to the Operaton engine.
#
# Usage:
#   ./bootstrap/bpmn-deploy.sh                    # auto-detect (docker exec or BPM_URL)
#   BPM_URL=https://bpm.example.org ./bootstrap/bpmn-deploy.sh
#
# Deploys every .bpmn file in bootstrap/bpmn/ to the engine's REST API
# (POST /engine-rest/deployment/create). Idempotent: re-running updates
# existing deployments by name.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BPMN_DIR="${SCRIPT_DIR}/bpmn"

if ! command -v curl >/dev/null 2>&1; then
  echo "error: curl is required" >&2
  exit 1
fi

# ── Resolve the engine URL ─────────────────────────
# 1. Explicit BPM_URL env var (e.g. https://bpm.example.org)
# 2. Docker exec into the opensme-camunda container (localhost:8080 inside)
# 3. Fallback: http://localhost:8080 (works if port is published)

BPM_URL="${BPM_URL:-}"
USE_DOCKER_EXEC=false

if [ -n "$BPM_URL" ]; then
  echo "Using BPM_URL: ${BPM_URL}"
elif docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^opensme-camunda$'; then
  echo "Found opensme-camunda container — deploying via docker exec"
  USE_DOCKER_EXEC=true
else
  BPM_URL="http://localhost:8080"
  echo "Using default BPM_URL: ${BPM_URL}"
fi

# ── Wait for the engine ────────────────────────────
echo "Waiting for Operaton engine…"
if [ "$USE_DOCKER_EXEC" = true ]; then
  for i in $(seq 1 30); do
    if docker exec opensme-camunda wget -q -O /dev/null http://localhost:8080/engine-rest/engine 2>/dev/null; then
      echo "  engine is up (via docker exec)"
      break
    fi
    if [ "$i" -eq 30 ]; then
      echo "error: engine not reachable in opensme-camunda container" >&2
      exit 1
    fi
    sleep 2
  done
else
  for i in $(seq 1 30); do
    if curl -sf "${BPM_URL}/engine-rest/engine" >/dev/null 2>&1; then
      echo "  engine is up"
      break
    fi
    if [ "$i" -eq 30 ]; then
      echo "error: engine not reachable at ${BPM_URL}" >&2
      exit 1
    fi
    sleep 2
  done
fi

# ── Deploy each .bpmn file ─────────────────────────
deployed=0
for bpmn_file in "${BPMN_DIR}"/*.bpmn; do
  [ -f "$bpmn_file" ] || continue
  name="$(basename "$bpmn_file")"
  echo "Deploying ${name}…"

  if [ "$USE_DOCKER_EXEC" = true ]; then
    docker cp "$bpmn_file" "opensme-camunda:/tmp/${name}" >/dev/null
    response=$(docker exec opensme-camunda curl -sf -X POST \
      "http://localhost:8080/engine-rest/deployment/create" \
      -H "Accept: application/json" \
      -F "deployment-name=${name}" \
      -F "deployment-source=opensme-bootstrap" \
      -F "deploy-changed-only=false" \
      -F "${name}=@/tmp/${name};type=text/xml") || {
      echo "  error: deployment failed for ${name}" >&2
      docker exec opensme-camunda rm -f "/tmp/${name}" 2>/dev/null || true
      exit 1
    }
    docker exec opensme-camunda rm -f "/tmp/${name}" 2>/dev/null || true
  else
    response=$(curl -sf -X POST "${BPM_URL}/engine-rest/deployment/create" \
      -H "Accept: application/json" \
      -F "deployment-name=${name}" \
      -F "deployment-source=opensme-bootstrap" \
      -F "deploy-changed-only=false" \
      -F "${name}=@${bpmn_file};type=text/xml") || {
      echo "  error: deployment failed for ${name}" >&2
      exit 1
    }
  fi

  proc_def=$(echo "$response" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    if d.get('deployedProcessDefinitions'):
        for k, v in d['deployedProcessDefinitions'].items():
            print(f'  process: {v.get(\"key\",\"?\")} v{v.get(\"version\",\"?\")} — {v.get(\"name\",\"?\")}')
    else:
        print('  deployed (no process definitions)')
except Exception as e:
    print(f'  deployed (parse error: {e})')
" 2>&1)
  echo "$proc_def"
  deployed=$((deployed + 1))
done

if [ "$deployed" -eq 0 ]; then
  echo "No .bpmn files found in ${BPMN_DIR}"
  exit 0
fi

echo ""
echo "Deployed ${deployed} process definition(s)."
if [ "$USE_DOCKER_EXEC" = true ]; then
  echo "Cockpit: http://localhost:8080/operaton/app/   (default: demo/demo)"
  echo "REST:    http://localhost:8080/engine-rest/engine"
else
  echo "Cockpit: ${BPM_URL}/operaton/app/   (default: demo/demo)"
  echo "REST:    ${BPM_URL}/engine-rest/engine"
fi
