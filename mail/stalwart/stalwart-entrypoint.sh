#!/bin/sh
# ── Stalwart entrypoint ────────────────────────
# Renders config.toml.template with env vars, then starts Stalwart.
set -e

TEMPLATE=/etc/stalwart/config.toml.template
OUTPUT=/etc/stalwart/config.toml

if [ -f "$TEMPLATE" ]; then
  echo "[stalwart-entrypoint] Rendering $TEMPLATE → $OUTPUT"
  envsubst '$MAIL_DOMAIN $STALWART_ADMIN_PASSWORD' \
    < "$TEMPLATE" > "$OUTPUT"
  echo "[stalwart-entrypoint] Done."
else
  echo "[stalwart-entrypoint] No template found, using existing $OUTPUT"
fi

exec "$@"
