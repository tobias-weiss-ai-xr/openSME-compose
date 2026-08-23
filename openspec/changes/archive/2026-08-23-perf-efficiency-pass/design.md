## Context

The stack is already profile-driven with per-tier Postgres commands,
Redis/Memcached sizing and `deploy.resources` limits/reservations for core and
overlay services. Baseline renders (merged config, `docker compose config`):

| Tier  | Σlimits   | Σreservations | Host      | Budget target (res) |
|-------|-----------|---------------|-----------|---------------------|
| soho  | ~1.5 GB   | ~0.7 GB        | 4c/8G     | ≤ 6 GB              |
| small | ~7.5 GB   | ~3.4 GB        | 8c/24G    | ≤ 20 GB             |
| mediu | ~24 GB    | ~8.1 GB        | 16c/48G   | ≤ 40 GB             |

(profile-gated services excluded; targets leave headroom for OS + Docker.)

What is missing is discipline: no logging caps, no `init`, no
`security_opt`/`read_only`, no `stop_grace_period`, no `shm_size`, no
healthchecks on traefik/taskfleet, no `depends_on` for overlays, no digest
pinning, and no measurement layer. This change closes all of those as one
coherent pass and proves it with benchmarks.

## Goals / Non-Goals

**Goals:**
- Enforce per-tier budget targets (SOHO ≤ 6G, Small ≤ 20G, Medium ≤ 40G
  reservations) with Layer-0 invariant checks that fail CI when a service
  regresses (no limits / no logging / no healthcheck).
- Active-op efficiency: capped logs (50m×3), tmpfs for ephemeral data,
  digest-pinned critical images, `make prune` + `make logs-size`.
- Runtime performance: `shm_size` where shared memory is the bottleneck,
  tuned Postgres/Redis/Memcached/PgBouncer per tier, Traefik healthcheck +
  compression.
- Deterministic cold starts: healthconditioned `depends_on` for every overlay.
- Measurable outcome: `tests/07-bench/` + `make bench` (memory, boot time,
  p95 HTTP latency) with a static CI subset and a documented before/after.

**Non-Goals:**
- No re-architecture (no swapping proxy/cache/mail components).
- No live auto-scaling, no Kubernetes ports, no per-user SLOs.
- No changes to SSO, security boundaries, or data durability guarantees
  (persistence of Postgres/Redis stays as-is; only cache-only instances get
  durability reductions where safe).

## Decisions

1. **Compose-level defaults before per-service overrides.** Logging caps and
   `init` are set globally (top-level defaults / x-anchors) so a new overlay
   cannot silently add an unbounded, unreaped service; budgets are enforced by
   Layer-0 checks reading the merged config.

2. **Budget targets expressed as reservation sums per tier** (SOHO ≤ 6G,
   Small ≤ 20G, Medium ≤ 40G). Reservations are what the scheduler guarantees;
   limits cap spikes. Targets documented in `docs/perf/baselines.md` and CI
   asserted from merged renders.

3. **`shm_size` standard:** postgres 256M (small) / 512M (medium),
   collabora/oCIS/tika 256M–512M — sized from actual `/dev/shm` consumers,
   not blanket.

4. **Digest pinning selective:** pin only stable, well-known images
   (traefik, postgres, redis, memcached, stalwart, sogo, gotenberg/tika) in
   `.env.example`/CI check; leave frequently-rebuilt images (portal) on tags
   with a documented fast path to prebuilt GHCR images.

5. **Benchmarks are additive and opt-in:** `tests/07-bench/` never runs in the
   normal CI gate; CI runs only the static budget/invariant subset. Live runs
   happen via `make bench` (host) and results are recorded in
   `docs/perf/benchmark-run.md`.

6. **"What may run per tier" matrix** documents strip decisions (e.g., SOHO
   core-only, Small+ does opencloud/mail/invoicing/paperless, chat/collab are
   profiles) so operators can delete, not just resize.

## Risks / Trade-offs

- **Log caps can hide diagnostics** — mitigated by `max-file: 3` and
  documented `make logs-*` helpers to dump/rotate on demand.
- **Restart/Init:** `init: true` adds ~1 MB per container but fixes zombie
  reaping; negligible cost, standard practice.
- **Tempfs on service data risks:** only ephemeral/non-persistent dirs get
  tmpfs; state volumes untouched.
- **Benchmarks on shared hosts vary** — before/after runs must pin the same
  host & load script; CI static subset is the regression gate, live numbers
  are advisory evidence.
