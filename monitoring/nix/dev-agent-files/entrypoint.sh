#!/usr/bin/env bash
set -euo pipefail

echo "[INFO] === openSME Dev Agent (Docker) v${OPERATOR_VERSION:-3.1.0-docker} starting ==="
echo "[INFO] LLM Backend: ${LLM_BACKEND:-ollama}"
echo "[INFO] Ollama URL: ${OLLAMA_URL:-http://ollama:11434}"
echo "[INFO] Ollama Model: ${OLLAMA_MODEL:-qwen3-30b-a3b:latest}"
echo "[INFO] Watch namespaces: ${OPERATOR_WATCH_NAMESPACES:-opensme,default}"
echo "[INFO] Reconcile interval: ${RECONCILE_INTERVAL:-60}s"
echo "[INFO] Health probe: ${OPERATOR_HEALTH_PROBE_BIND_ADDRESS:-0.0.0.0:8081}"
echo "[INFO] Metrics bind: ${OPERATOR_METRICS_BIND_ADDRESS:-0.0.0.0:8080}"

# Create runtime directories
mkdir -p /var/lib/opensme /var/log/opensme /var/cache/opensme /run/opensme /tmp /home/opensme

# Execute the Python operator
exec python3 /opt/dev-agent/dev_agent.py "$@"
