#!/bin/sh
# ── Stalwart entrypoint ────────────────────────
# Renders config.toml.template with env vars into the v0.15 schema, then
# starts Stalwart. The v0.15 image only generates a config when none exists,
# so our rendered file takes full precedence (no interactive wizard).
set -e

TEMPLATE=/etc/stalwart/config.toml.template
OUTDIR=/opt/stalwart/etc
OUTPUT=$OUTDIR/config.toml

mkdir -p "$OUTDIR"

if [ -f "$TEMPLATE" ]; then
  echo "[stalwart-entrypoint] Rendering $TEMPLATE -> $OUTPUT"
  sed \
    -e "s|\${MAIL_DOMAIN}|${MAIL_DOMAIN:-mail.opensme.org}|g" \
    -e "s|\${STALWART_ADMIN_PASSWORD}|${STALWART_ADMIN_PASSWORD:-CHANGEME_stalwart_admin}|g" \
    -e "s|\${STALWART_PUBLIC_URL}|${STALWART_PUBLIC_URL:-https://mail.opensme.org}|g" \
    "$TEMPLATE" > "$OUTPUT"
  echo "[stalwart-entrypoint] Done."
else
  echo "[stalwart-entrypoint] No template found, using existing $OUTPUT (if any)"
fi

exec "$@"
