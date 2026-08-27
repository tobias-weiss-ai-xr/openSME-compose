#!/bin/sh
# ── SOGo entrypoint ────────────────────────────
# Renders sogo.conf.template with env vars, then starts SOGo as the image's
# dedicated sogo uid (999) — SOGo refuses to run as root.
# Uses sed instead of envsubst for maximum image compatibility.
set -e

TEMPLATE=/sogo.conf.template
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

# Drop privileges like the upstream sogod.sh does (uid/gid 999).
SOGO_UID=${SOGO_UID:-999}
chown -R "$SOGO_UID:$SOGO_UID" /etc/sogo 2>/dev/null || true
chown -R "$SOGO_UID:$SOGO_UID" /srv 2>/dev/null || true
mkdir -p /var/run/sogo
chown "$SOGO_UID:$SOGO_UID" /var/run/sogo 2>/dev/null || true

exec setpriv --reuid="$SOGO_UID" --regid="$SOGO_UID" --init-groups \
  /usr/local/sbin/sogod -WOUseWatchDog YES -WOPort "127.0.0.1:20000" \
  -WOPidFile /var/run/sogo/sogo.pid
