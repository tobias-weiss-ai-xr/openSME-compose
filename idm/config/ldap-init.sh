#!/bin/bash
# ── openSME LDAP initialization ─────────────
# Runs on first container start via docker-entrypoint-init.d
# Creates organizational units and sample users.

set -e

LDAP_BASE_DN="dc=opensme,dc=example,dc=com"
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

# Create organizational structure
cat > /tmp/ou-people.ldif <<EOF
dn: ou=people,${LDAP_BASE_DN}
objectClass: organizationalUnit
ou: people
EOF

cat > /tmp/ou-groups.ldif <<EOF
dn: ou=groups,${LDAP_BASE_DN}
objectClass: organizationalUnit
ou: groups
EOF

cat > /tmp/ou-apps.ldif <<EOF
dn: ou=apps,${LDAP_BASE_DN}
objectClass: organizationalUnit
ou: apps
EOF

# Add organizational units
add_ldif /tmp/ou-people.ldif 2>/dev/null || true
add_ldif /tmp/ou-groups.ldif 2>/dev/null || true
add_ldif /tmp/ou-apps.ldif 2>/dev/null || true

# Create groups
cat > /tmp/group-admins.ldif <<EOF
dn: cn=admins,ou=groups,${LDAP_BASE_DN}
objectClass: groupOfNames
cn: admins
member: cn=admin,${LDAP_BASE_DN}
EOF

cat > /tmp/group-users.ldif <<EOF
dn: cn=users,ou=groups,${LDAP_BASE_DN}
objectClass: groupOfNames
cn: users
member: uid=user01,ou=people,${LDAP_BASE_DN}
member: uid=user02,ou=people,${LDAP_BASE_DN}
EOF

add_ldif /tmp/group-admins.ldif 2>/dev/null || true
add_ldif /tmp/group-users.ldif 2>/dev/null || true

echo "LDAP initialization complete."
