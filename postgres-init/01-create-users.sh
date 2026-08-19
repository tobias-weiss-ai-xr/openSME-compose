#!/bin/bash
set -e

# ═══════════════════════════════════════════════════════════════
# openSME — PostgreSQL User Creation
# ═══════════════════════════════════════════════════════════════
# Creates per-service database users with passwords.
# Runs after 00-create-databases.sql.
#
# Databases (created by 00-create-databases.sql):
#   zitadel, sogo, casdoor_db, synapse_db, paperless_db,
#   invoiceninja_db, notes_db
# ═══════════════════════════════════════════════════════════════

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-EOSQL
    -- ── Casdoor (lightweight IAM alternative) ──
    DO \$\$
    BEGIN
      CREATE USER casdoor_user WITH PASSWORD '${CASDOOR_DB_PASSWORD:-changeme}';
    EXCEPTION WHEN duplicate_object THEN
      ALTER USER casdoor_user WITH PASSWORD '${CASDOOR_DB_PASSWORD:-changeme}';
    END \$\$;
    GRANT ALL PRIVILEGES ON DATABASE casdoor_db TO casdoor_user;

    -- ── Synapse (Matrix chat) ──
    DO \$\$
    BEGIN
      CREATE USER synapse_user WITH PASSWORD '${SYNAPSE_DB_PASSWORD:-changeme}';
    EXCEPTION WHEN duplicate_object THEN
      ALTER USER synapse_user WITH PASSWORD '${SYNAPSE_DB_PASSWORD:-changeme}';
    END \$\$;
    GRANT ALL PRIVILEGES ON DATABASE synapse_db TO synapse_user;

    -- ── Paperless-ngx (document management) ──
    DO \$\$
    BEGIN
      CREATE USER paperless_user WITH PASSWORD '${PAPERLESS_DB_PASSWORD:-changeme}';
    EXCEPTION WHEN duplicate_object THEN
      ALTER USER paperless_user WITH PASSWORD '${PAPERLESS_DB_PASSWORD:-changeme}';
    END \$\$;
    GRANT ALL PRIVILEGES ON DATABASE paperless_db TO paperless_user;

    -- ── Invoice Ninja (invoicing) ──
    DO \$\$
    BEGIN
      CREATE USER invoiceninja_user WITH PASSWORD '${INVOICENINJA_DB_PASSWORD:-changeme}';
    EXCEPTION WHEN duplicate_object THEN
      ALTER USER invoiceninja_user WITH PASSWORD '${INVOICENINJA_DB_PASSWORD:-changeme}';
    END \$\$;
    GRANT ALL PRIVILEGES ON DATABASE invoiceninja_db TO invoiceninja_user;

    -- ── Notes/Impress (collaborative notes) ──
    DO \$\$
    BEGIN
      CREATE USER notes_user WITH PASSWORD '${NOTES_DB_PASSWORD:-changeme}';
    EXCEPTION WHEN duplicate_object THEN
      ALTER USER notes_user WITH PASSWORD '${NOTES_DB_PASSWORD:-changeme}';
    END \$\$;
    GRANT ALL PRIVILEGES ON DATABASE notes_db TO notes_user;
EOSQL

echo "✅ Per-service database users created (casdoor, synapse, paperless, invoiceninja, notes)"
