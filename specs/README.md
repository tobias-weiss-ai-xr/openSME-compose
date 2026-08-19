# Service Specifications

Each YAML file in this directory declares the **expected state** of services
in a compose overlay. The test harness (`tests/01-specs/validate_specs.py`)
parses every compose file and verifies it matches its spec.

## Spec format

```yaml
services:
  <service-name>:
    image: <image:tag>           # expected image (or null for build)
    compose_file: <path>         # which compose file defines this service
    required: true               # must be present in the compose file
    profiles: ["invoice"]        # Docker Compose profiles (empty/omit = always)
    host_ports: [80, 443]        # ports exposed to the host (empty = internal only)
    healthcheck: true            # must define a healthcheck
    networks: [opensme-net]     # expected networks
    volumes:                     # expected volumes
      - postgres-data:/var/lib/postgresql/data
    env: [POSTGRES_PASSWORD]     # required env vars (checked against .env.example)
    traefik_labels: true         # must have traefik.* labels
    resource_limits:             # deploy.resources.limits
      memory: 4G
    depends_on: [postgres]       # expected dependencies
```

## Files

| File | Services |
|---|---|
| `core.yml` | Traefik, PostgreSQL, PgBouncer, Redis, Memcached, Portal |
| `idm.yml` | Zitadel, Casdoor |
| `opencloud.yml` | OpenCloud, Collabora, MinIO |
| `mail.yml` | Stalwart, SOGo |
| `services.yml` | Invoice Ninja, Paperless, CryptPad, Synapse, Element, Notes |
| `monitoring.yml` | dev-agent, predictive-agent, Ollama, taskfleet |

## Running

```bash
make specs       # validate all specs against compose files
make test-static # specs + contracts + env + secrets + yaml lint
make test        # + container health + smoke
make test-all    # + integration + e2e + security
```
