#!/bin/sh
# ── Stalwart entrypoint ────────────────────────
# Renders config.toml.template with env vars, then starts Stalwart.
# Uses sed instead of envsubst for maximum image compatibility (Alpine).
set -e

TEMPLATE=/etc/stalwart/config.toml.template
OUTPUT=/etc/stalwart/config.toml

if [ -f "$TEMPLATE" ]; then
  echo "[stalwart-entrypoint] Rendering $TEMPLATE → $OUTPUT"
  sed \
    -e "s|\${MAIL_DOMAIN}|${MAIL_DOMAIN:-mail.opensme.org}|g" \
    -e "s|\${STALWART_ADMIN_PASSWORD}|${STALWART_ADMIN_PASSWORD:-}|g" \
    "$TEMPLATE" > "$OUTPUT"
  echo "[stalwart-entrypoint] Done."
else
  echo "[stalwart-entrypoint] No template found, using existing $OUTPUT"
fi

exec "$@"
