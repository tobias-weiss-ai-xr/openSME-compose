# Contracts
# ═══════════════════════════════════════════════════════════════
# Contract files define rules that the compose files must satisfy.
# The test harness (tests/02-contracts/validate_contracts.py) parses
# each contract and checks it against all compose files.
#
# Contract format:
#   name:        Short identifier
#   description: Human-readable explanation
#   severity:    error | warning
#   rules:       List of rule definitions
#
# Rule types:
#   env-defined         All env vars in compose files exist in .env.example
#   no-host-ports       Listed services must not expose host ports
#   healthcheck-required  Listed services must define a healthcheck
#   network-isolation   All services must be on opensme-net (not host)
#   resource-limits     All services must have deploy.resources.limits
#   no-hardcoded-secrets  No CHANGEME_ values in compose files (only in .env.example)
#   traefik-labels      Services with traefik_labels must have Host() rule + TLS
#   image-pinned        All images must use a tag (not :latest for production)
#   volume-named        All volumes must be named (not anonymous)
