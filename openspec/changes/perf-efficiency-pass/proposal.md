## Why

openSME already has per-tier resource budgets (soho/small/medium Postgres
tuning, CPU/memory limits, PgBouncer, Redis, Memcached). But a systematic audit
shows the stack is **not yet disciplined about the rest**:

- **No log rotation or size caps anywhere** — unbounded `json-file` logs will
  fill a 120 GB SOHO disk over months of normal operation.
- **No `init: true`, no `security_opt`/`cap_drop`/`read_only`** on any
  service — zombie reaping is left to luck, and attack surface is wider than
  it needs to be.
- **Traefik and taskfleet have no healthcheck**; no service tunes
  `stop_grace_period`; overlay services (paperless, invoice-ninja, notes,
  chat, mail) have **no `depends_on` wait conditions** — cold starts race.
- **No `shm_size`** — the 64 MB default `/dev/shm` is a real ceiling for
  Postgres, Collabora, oCIS and Tika at small/medium tiers.
- **Portal is `build:` from source** at deploy time; no prebuilt-image fast
  path or digest pinning anywhere.
- **Reservations are over-provisioned** at the top end (Collabora 4G limit /
  1G reservation, oCIS 4G/2G, Redis 4G/1G on medium).

SMEs pay for VPS tiers that must *fit* their workload and *stay* fit over
time. Efficiency is not one knob — it is budgets, disk hygiene, startup
ordering, runtime tuning and measurement working together. This change makes
that systematic: every dimension gets a spec, every tier gets a documented
budget, and a benchmark layer proves before/after instead of relying on
assertions.

## What Changes

- **Baselines & audit**: merged-config renders for all 3 tiers, Σlimits /
  Σreservations tables, image inventory, documented budget targets
  (SOHO ≤ 6G res, Small ≤ 20G, Medium ≤ 40G).
- **Layer-0 invariant checks**: every service must have resource limits, a
  logging cap, and (where feasible) a healthcheck — enforced in CI.
- **Ops hygiene**: global `json-file` logging (max-size 50m, max-file 3),
  `stop_grace_period` per service, `make prune`/`make logs-size`, digest
  pinning, tmpfs for ephemeral dirs.
- **Right-sizing**: trim over-provisioned reservations per tier; per-tier
  "what may run" matrix; `init: true`, `no-new-privileges`, `cap_drop` where
  safe.
- **Runtime tuning**: `shm_size` for Postgres/oCIS/Collabora/Tika; Postgres
  checkpoint/bgwriter/autovacuum; Redis lazy freeing; Memcached slabs;
  PgBouncer pools × tier; Traefik healthcheck + compression middleware.
- **Boot correctness**: `depends_on` + `service_healthy` for every overlay.
- **Benchmark layer**: `tests/07-bench/` + `make bench` — steady-state memory
  (docker stats), boot time, HTTP latency via Traefik; static budget
  assertions run in CI, live evidence recorded on demand.

## Capabilities

### New Capabilities

- `perf-budgets`: per-tier resource budgets, invariant checks, and the
  services-may-run matrix
- `perf-ops`: log rotation/caps, stop_grace_period, prune targets, digest
  pinning, tmpfs/read-only hygiene
- `perf-tuning`: runtime tuning — shm_size, Postgres/Redis/Memcached/PgBouncer
  parameters, Traefik healthcheck + compression
- `perf-boot`: startup ordering and healthconditioned dependencies for all overlays
- `perf-bench`: benchmark layer with static CI subset and on-demand live runs

### Modified Capabilities

(none — this is additive over the existing per-tier budgets)

## Impact

- Modified: `docker-compose.yml`, `profiles/{soho,small,medium}.yml`, all
  overlay files (`idm/`, `mail/`, `opencloud/`, `services/`,
  `monitoring/`), `Makefile`, `tests/00-static/`, `.env.example`,
  `README.md`, `ROADMAP.md`, `VALIDATION.md`
- New: `docs/perf/`, `tests/07-bench/`, prebuilt portal image path
- No change to SSO, data planes, or user-facing behaviour beyond faster,
  steadier response and smaller footprint.
