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
│   ├── check_perf.py            #   Perf gate: budgets, limits, log caps, healthchecks
│   ├── check_boot.py            #   Boot contracts (image pins, entrypoints, Traefik…)
│   ├── compose_config.py        #   Compose matrix: every overlay combo renders
│   └── yaml_lint.py             #   YAML syntax + structure validation
├── 01-specs/                    # Layer 1: Spec compliance (no containers)
│   └── validate_specs.py        #   Compose files match specs/
├── 02-contracts/                # Layer 2: Contract validation (no containers)
│   └── validate_contracts.py    #   contracts/ rules (env, ports, health, networks, security)
├── 03-smoke/                    # Layer 3: Smoke tests (requires running stack)
│   └── run.py                   #   HTTP endpoints, container health
├── 04-integration/              # Layer 4: Cross-service integration contracts
│   └── run.py                   #   DB provisioning, pgbouncer, SSO issuer, live AI proxy
│                                #   (skips when a participating service isn't running)
├── 05-e2e/                      # Layer 5: E2E tests — SSO/OIDC flows (requires running stack)
│   └── run.py                   #   Zitadel login flow, SSO reuse, logout, app checks,
│                                #   portal landing page + security-header contract
├── 06-security/                 # Layer 6: Security audit (no containers)
│   └── audit.py                 #   Exposed ports, secrets, TLS, privileges
├── 07-bench/                    # Layer 7: Benchmark (optional, manual)
│   └── run_bench.py             #   Memory + p50/p99 latency per tier → docs/perf/
└── 08-k8s/                      # Layer 8: Kubernetes deployment health (requires kubectl)
    ├── run.py                   #   Layer 8 runner
    ├── check_cluster.py         #   ArgoCD app sync/health, node readiness
    ├── check_pods.py            #   Pod health (Running, CrashLoopBackOff, restarts)
    ├── check_deployments.py     #   Deployment + StatefulSet readiness
    ├── check_images.py          #   Image registry validation (no legacy registries)
    ├── check_ingress.py         #   Ingress LB address + TLS, PVC binding
    ├── check_services.py        #   Service endpoints
    └── check_keycloak.py        #   Keycloak + OIDC discovery + OAuth2 Proxy
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

# Run cross-service integration contracts (requires running stack, same
# COMPOSE_FILE selection as the stack)
COMPOSE_FILE="docker-compose.yml:idm/zitadel.yml:..." python3 tests/04-integration/run.py

# Run security audit
python3 tests/run.py --security

# Run e2e tests (requires running stack; SSO flows need ZITADEL_ADMIN_PASSWORD
# from .env and access to the running zitadel container for the machine PAT,
# or a pre-registered app via E2E_OIDC_CLIENT_ID)
python3 tests/run.py --e2e --domain opensme.local

# Run k8s deployment tests (requires kubectl + running cluster)
python3 tests/run.py --k8s

# Run everything
python3 tests/run.py --domain opensme.org
```

## Makefile integration

```bash
make lint          # Layer 0: compose-check + env-check + secret-scan + perf + boot contracts + compose matrix
make specs         # Layer 1: spec validation
make contracts     # Layer 2: contract validation
make test-static   # Layers 0-2 (all static checks)
make container     # container health table (requires stack)
make smoke         # Layer 3: HTTP smoke (requires stack)
make integration   # Layer 4: cross-service wiring (requires stack)
make e2e           # Layer 5: SSO/OIDC e2e flows (requires stack)
make security      # Layer 6: security audit
make bench         # Layer 7: live benchmark (optional)
make test          # Layers 0-3 (static + container + smoke)
make test-all      # Layers 0-6 (full suite incl. e2e + integration)
```

## Integration contracts (`04-integration/`)

Where Layer 3 checks single-service reachability from the host, Layer 4
verifies the **wiring between services** — probed from inside the compose
network or through the edge:

1. **Databases** — postgres provisions a database for every DB-backed
   service that is running (mirrors `postgres-init/00-create-databases.sql`)
2. **pgbouncer** — answers the PostgreSQL protocol inside the network
   (DNS + pool, probed via `pg_isready` from the postgres container)
3. **SSO issuer consistency** — `OC_OIDC_ISSUER` from opencloud's runtime
   env equals the issuer zitadel actually serves via OIDC discovery
4. **AI proxy round-trip** — `POST /api/ai/chat` succeeds end-to-end
   against the live llama.cpp backend (the deployed twin of the in-process
   contract tests in `portal/src/main.rs`)

Every check skips gracefully when a participating service isn't running,
so the layer stays meaningful for any `COMPOSE_FILE` subset.

## Portal unit tests (`portal/`)

The Rust portal ships its own test suite — in-process HTTP contract tests
(tower `oneshot`, no sockets), a mock OpenAI-compatible upstream for the AI
proxy, and property-based tests (proptest) for the announcements parser and
HTML escaping:

```bash
cd portal && cargo test     # 21 tests — runs in CI's code-quality job via `make lint-code`
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

## E2E tests (`05-e2e/`) — SSO & friends

Exercises real user journeys over HTTP against a running stack. No browser
needed — logins are performed programmatically through the Zitadel v2
Session API (the same API the hosted Login v2 UI uses), so the suite works
against the React-based Login v2 UI where form scraping cannot.

What is covered (full story catalog with Given/When/Then:
[docs/E2E-JOURNEYS.md](../docs/E2E-JOURNEYS.md)):

1. **IdP discovery** — `/.well-known/openid-configuration` + JWKS
2. **Portal** — landing page, `/health`, `/api/services`, security-header
   contract (CSP, nosniff, frame-deny, referrer-policy — mirrors the
   middleware contract-tested in `portal/src/main.rs`), announcements
   consumer schema, AI card gating (hidden unless `AI_API_URL` set)
3. **SSO login flow** — authorization-code + PKCE, logged in via the v2
   Session API (`POST /v2/sessions` + password check + auth-request
   finalize) using the seeded login-client PAT. A throw-away OIDC app
   (`e2e-sso` project) is bootstrapped via the Zitadel Management API
   using the seeded machine-user PAT (`docker compose cp
   zitadel:/machinekey/pat -`) and removed afterwards; leftover apps
   from crashed runs are cleaned up (bootstrap is idempotent)
   **+ ID-token verification**: the issued token's RS256 signature is
   verified against the live JWKS (pure-stdlib RSA), and its
   iss/aud/exp/iat/nonce/sub claims are checked
4. **Single sign-on** — a second authorize is finalized with the existing
   IdP session; no second credential check
5. **Logout** — the session is terminated (`DELETE /v2/sessions/{id}`) and
   the dead session must be rejected
6. **App reachability** — opencloud, synapse, notes, paperless, ticketing,
   cms, store, webmail (when running)
7. **SSO wiring** — synapse `/_matrix/client/v3/login/sso/redirect` and
   SOGo webmail must redirect to the IdP, not to their own login pages

Configuration (env vars win over `.env`):

| Variable | Purpose |
|---|---|
| `ZITADEL_ADMIN_PASSWORD` | admin credentials for the login flow (`.env`) |
| `E2E_ZITADEL_LOGIN_NAME` | login name (default `zitadel-admin`) |
| `E2E_ZITADEL_PAT` | machine-user PAT (skip the `docker compose cp`) |
| `E2E_ZITADEL_LOGINCLIENT_PAT` | login-client PAT (skip the `docker compose cp`) |
| `E2E_OIDC_CLIENT_ID` / `_SECRET` | pre-registered OIDC app (skip bootstrap) |
| `E2E_INSECURE=1` | disable TLS verification |

The seeded credentials come from `zitadel setup --steps /steps.yaml`
(`idm/zitadel/steps.yaml` — v4 does not pick up the machine/PAT seeding
from env vars alone): it creates the `opensme-automation` machine user
(IAM_OWNER, PAT at `/machinekey/pat`) and the `opensme-login-client`
service user (IAM_LOGIN_CLIENT, PAT at `/machinekey/login-client.pat`).

Local demo conveniences (domains under `.local`/`.localhost`/`.test`):
unresolvable hostnames resolve to loopback (reaches local Traefik, no
`/etc/hosts` edits) and TLS verification is off (self-signed demo certs).

Skips don't fail the run; flow failures (bad login, missing code, session
surviving logout) do.
