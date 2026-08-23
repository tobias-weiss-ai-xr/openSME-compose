#!/bin/sh
# ── SOGo entrypoint ────────────────────────────
# Renders sogo.conf.template with env vars, then starts SOGo.
# Uses sed instead of envsubst for maximum image compatibility.
set -e

TEMPLATE=/etc/sogo/sogo.conf.template
OUTPUT=/etc/sogo/sogo.conf

if [ -f "$TEMPLATE" ]; then
  echo "[sogo-entrypoint] Rendering $TEMPLATE → $OUTPUT"
  sed \
    -e "s|\${SOGO_DB_PASSWORD}|${SOGO_DB_PASSWORD:-CHANGEME_sogo}|g" \
    -e "s|\${LDAP_ROOT_DN}|${LDAP_ROOT_DN:-dc=opensme,dc=org}|g" \
    -e "s|\${LDAP_ADMIN_PASSWORD}|${LDAP_ADMIN_PASSWORD:-CHANGEME_ldap}|g" \
    -e "s|\${OPENSME_DOMAIN}|${OPENSME_DOMAIN:-opensme.org}|g" \
    -e "s|\${TZ}|${TZ:-Europe/Berlin}|g" \
    "$TEMPLATE" > "$OUTPUT"
  echo "[sogo-entrypoint] Done."
else
  echo "[sogo-entrypoint] No template found, using existing $OUTPUT"
fi

exec "$@"
