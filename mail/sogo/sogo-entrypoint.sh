#!/bin/sh
# ── SOGo entrypoint ────────────────────────────
# Renders sogo.conf.template with env vars, then starts SOGo.
set -e

TEMPLATE=/etc/sogo/sogo.conf.template
OUTPUT=/etc/sogo/sogo.conf

if [ -f "$TEMPLATE" ]; then
  echo "[sogo-entrypoint] Rendering $TEMPLATE → $OUTPUT"
  envsubst '$SOGO_DB_PASSWORD $LDAP_ROOT_DN $LDAP_ADMIN_PASSWORD $OPENSME_DOMAIN $TZ' \
    < "$TEMPLATE" > "$OUTPUT"
  echo "[sogo-entrypoint] Done."
else
  echo "[sogo-entrypoint] No template found, using existing $OUTPUT"
fi

# Create sogo database if it doesn't exist (wait for PostgreSQL)
until pg_isready -h pgbouncer -p 5432 -U opensme -q 2>/dev/null; do
  echo "[sogo-entrypoint] Waiting for PgBouncer..."
  sleep 2
done

# Check if sogo DB exists, create if not
# psql via pg_isready only checks connectivity — we need a client for DDL
# but psql isn't guaranteed in the SOGo image. Skip DB creation here;
# it's handled by postgres-init (see docker-compose.yml initdb mount).
echo "[sogo-entrypoint] PostgreSQL available."

exec "$@"
