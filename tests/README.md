# Test Harness

Spec → Contract → Test scaffold for openSME Compose.

## Structure

```
tests/
├── conftest.py                  # Shared utilities (compose loader, spec loader, etc.)
├── run.py                       # Main entry point — runs all layers
├── requirements.txt             # Python dependencies (pyyaml)
├── 00-static/                   # Layer 0: Static validation (no containers)
│   ├── check_env.py             #   Env var completeness (.env.example)
│   ├── scan_secrets.py          #   Secret scanning (no CHANGEME_ in compose)
│   ├── check_platform.py        #   Runtime platform min versions (k3s, docker)
│   └── yaml_lint.py             #   YAML syntax + structure validation
├── 01-specs/                    # Layer 1: Spec compliance (no containers)
│   └── validate_specs.py        #   Compose files match specs/
├── 02-contracts/                # Layer 2: Contract validation (no containers)
│   └── validate_contracts.py    #   contracts/ rules (env, ports, health, networks, security)
├── 03-smoke/                    # Layer 3: Smoke tests (requires running stack)
│   └── run.py                   #   HTTP endpoints, container health
├── 04-integration/              # Layer 4: Integration tests (requires running stack)
│   └── (not yet implemented)
├── 05-e2e/                      # Layer 5: E2E browser tests (requires Playwright)
│   └── (not yet implemented)
└── 06-security/                 # Layer 6: Security audit (no containers)
    └── audit.py                 #   Exposed ports, secrets, TLS, privileges
├── 08-k8s/                     # Layer 8: Kubernetes deployment health (requires kubectl)
│   ├── run.py                   #   Layer 8 runner
│   ├── check_cluster.py         #   ArgoCD app sync/health, node readiness
│   ├── check_pods.py            #   Pod health (Running, CrashLoopBackOff, restarts)
│   ├── check_deployments.py     #   Deployment + StatefulSet readiness
│   ├── check_images.py          #   Image registry validation (no opencode.de)
│   ├── check_ingress.py         #   Ingress LB address + TLS, PVC binding
│   ├── check_services.py        #   Service endpoints
│   └── check_keycloak.py        #   Keycloak + OIDC discovery + OAuth2 Proxy
```

## Specs (`specs/`)

Declarative YAML files describing the **expected state** of each service:

```yaml
services:
  postgres:
    image: postgres:17-alpine
    compose_file: docker-compose.yml
    required: true
    host_ports: []          # internal only
    healthcheck: true
    networks: [opensme-net]
    volumes:
      - postgres-data:/var/lib/postgresql/data
    env: [POSTGRES_PASSWORD, POSTGRES_USER, POSTGRES_DB]
    traefik_labels: false
    resource_limits:
      memory: 4G
```

## Contracts (`contracts/`)

YAML files defining **rules** the compose files must satisfy:

```yaml
name: port-exposure
description: Internal services must not expose host ports
severity: error
rules:
  - type: no-host-ports
    services: [postgres, redis, memcached, ...]
```

## Running

```bash
# Install dependencies
pip install -r tests/requirements.txt

# Run all static layers (no running stack needed)
python3 tests/run.py --static

# Run specific layers
python3 tests/run.py --layer 0,1,2

# Run smoke tests (requires running stack)
python3 tests/run.py --smoke --domain opensme.org

# Run security audit
python3 tests/run.py --security

# Run k8s deployment tests (requires kubectl + running cluster)
python3 tests/run.py --k8s

# Run everything
python3 tests/run.py --domain opensme.org
```

## Makefile integration

```bash
make lint          # Layer 0: compose-check + env-check + secret-scan
make specs         # Layer 1: spec validation
make contracts     # Layer 2: contract validation
make test-static   # Layers 0-2 (all static checks)
make container     # Layer 2: container health (requires stack)
make smoke         # Layer 3: HTTP smoke (requires stack)
make security      # Layer 6: security audit
make k8s           # Layer 8: k8s deployment health
make test          # Layers 0-3 (static + container + smoke)
make test-all      # Layers 0-6 (full suite)
```

## Adding new specs

1. Add a service to the appropriate `specs/*.yml` file
2. Run `python3 tests/01-specs/validate_specs.py` to verify
3. Add the service to relevant `contracts/*.yml` files (ports, health, networks, security)

## Adding new contracts

1. Create or edit a `contracts/*.yml` file
2. Add a rule with a supported type (see `contracts/README.md`)
3. Run `python3 tests/02-contracts/validate_contracts.py` to verify
4. If a new rule type is needed, add a handler in `tests/02-contracts/validate_contracts.py`
