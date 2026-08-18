#!/bin/bash
# ── openSME LDAP initialization ─────────────
# Runs on first container start via docker-entrypoint-init.d
# Creates organizational units and sample users.
#
# Uses LDAP_ROOT_DN env var (set in idm/keycloak.yml).
# Falls back to dc=opensme,dc=org for backward compat.

set -e

LDAP_BASE_DN="${LDAP_ROOT_DN:-dc=opensme,dc=org}"
LDAP_ADMIN_DN="cn=admin,${LDAP_BASE_DN}"
LDAP_ADMIN_PASSWORD="${LDAP_ADMIN_PASSWORD:-CHANGEME_ldap}"

# Wait for slapd to be ready
sleep 2

add_ldif() {
  local ldif_file="$1"
  ldapadd -x -H ldap://localhost:389 \
    -D "${LDAP_ADMIN_DN}" \
    -w "${LDAP_ADMIN_PASSWORD}" \
    -f "${ldif_file}"
}

# ── Organizational structure ────────────────
for ou in people groups apps; do
  cat > "/tmp/ou-${ou}.ldif" <<EOF
dn: ou=${ou},${LDAP_BASE_DN}
objectClass: organizationalUnit
ou: ${ou}
EOF
  add_ldif "/tmp/ou-${ou}.ldif" 2>/dev/null || true
done

# ── Groups ───────────────────────────────────
cat > /tmp/group-admins.ldif <<EOF
dn: cn=admins,ou=groups,${LDAP_BASE_DN}
objectClass: groupOfNames
cn: admins
member: cn=admin,${LDAP_BASE_DN}
EOF
add_ldif /tmp/group-admins.ldif 2>/dev/null || true

cat > /tmp/group-users.ldif <<EOF
dn: cn=users,ou=groups,${LDAP_BASE_DN}
objectClass: groupOfNames
cn: users
member: uid=user01,ou=people,${LDAP_BASE_DN}
member: uid=user02,ou=people,${LDAP_BASE_DN}
EOF
add_ldif /tmp/group-users.ldif 2>/dev/null || true

echo "LDAP initialization complete."
