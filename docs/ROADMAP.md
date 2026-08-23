# Roadmap

Status and direction of the openSME Compose distribution.

## Current scope (done)

- **MVP runs on Docker Compose v2** using Zendis/openSME ecosystem images
  (Zitadel SSO, OpenCloud, SOGo+Stalwart, Traefik, PostgreSQL, Redis) plus SME
  staples: Invoice Ninja and Paperless-ngx.
- **3 vertical tiers** (soho / small / medium) + demo profiles; overlay
  system with `COMPOSE_FILE` composition.
- **7-layer test framework** (static → security) wired into CI, including
  secret scanning and a **perf-efficiency gate**
  (`tests/00-static/check_perf.py`).
- **Performance pass** (perf-efficiency-pass): universal log caps, hardening
  defaults (`init`, `no-new-privileges`, `cap_drop`), per-tier Postgres/Redis/
  PgBouncer tuning, boot-ordering `depends_on`, live benchmark harness.

## In flight

- **dev-maintenance-bot** (OpenSpec change `dev-maintenance-bot`): Go-based
  sidecar with embedded KB, healing, and privacy-preserving contribution back
  to the project.

## Backlog / ideas

- Digest-pinned image manifests for reproducible deploys (operator opt-in).
- Backup rotation to off-site object storage (rclone).
- Helm-free upgrades tooling: `docker compose pull` + rolling `up -d` with
  pre-flight contract checks.
- Cluster mode (out of scope by design — SME single-node focus).
- Permanent live benchmark evidence on a reference host per tier
  (`make bench`, recorded in `docs/perf/benchmark-run.md`).

## Perf budgets (target, enforced in CI)

| Tier | Σ reservations | Budget |
|------|---------------|--------|
| soho  | ~0.8G | 6G  |
| small | ~3.4G | 20G |
| medium| ~8.0G | 40G |

Numbers: [docs/perf/baselines.md](docs/perf/baselines.md).
