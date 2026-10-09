#!/bin/sh
# ── SOGo entrypoint ────────────────────────────
# Renders sogo.conf.template with env vars into the persistent config location
# the image expects (/srv/etc/sogo.conf on the sogo-data volume). The image's
# /sogod.sh then copies that to /etc/sogo/sogo.conf and drops privileges via
# `su sogo` (SOGo refuses to run as root). We delegate startup to the image's
# /start.sh so cron/memcached/apache2/sogod all start as designed.
# Uses sed instead of envsubst for maximum image compatibility.
set -e

TEMPLATE=/sogo.conf.template
OUTPUT=/srv/etc/sogo.conf

if [ -f "$TEMPLATE" ]; then
  echo "[sogo-entrypoint] Rendering $TEMPLATE → $OUTPUT"
  mkdir -p "$(dirname "$OUTPUT")"
  sed \
    -e "s|\${SOGO_DB_PASSWORD}|${SOGO_DB_PASSWORD:-CHANGEME_sogo}|g" \
    -e "s|\${LDAP_ROOT_DN}|${LDAP_ROOT_DN:-dc=opensme,dc=graphwiz,dc=ai}|g" \
    -e "s|\${LDAP_ADMIN_PASSWORD}|${LDAP_ADMIN_PASSWORD:-CHANGEME_ldap}|g" \
    -e "s|\${OPENSME_DOMAIN}|${OPENSME_DOMAIN:-opensme.graphwiz.ai}|g" \
    -e "s|\${TZ}|${TZ:-Europe/Berlin}|g" \
    "$TEMPLATE" > "$OUTPUT"
  chown sogo:sogo "$OUTPUT"
  echo "[sogo-entrypoint] Done."
else
  echo "[sogo-entrypoint] No template found, using existing $OUTPUT"
fi

# Delegate to the image's start script (drops to sogo user via su for sogod).
exec sh -c "/start.sh && tail -f /var/log/sogo/sogo.log"
