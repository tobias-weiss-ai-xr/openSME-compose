## 1. Baselines and audit

- [x] 1.1 Render merged compose config for all three tiers into docs/perf/ with Σlimits and Σreservations tables
- [x] 1.2 Capture image inventory and steady-state memory estimates into docs/perf/baselines.md
- [x] 1.3 Add a Layer 0 static check asserting every service has deploy resource limits across all profiles
- [x] 1.4 Add a Layer 0 static check asserting every service has a logging cap
- [x] 1.5 Add a Layer 0 static check asserting every long-running service has a healthcheck

## 2. Ops hygiene — disk and longevity

- [x] 2.1 Add global logging defaults (json-file, max-size 50m, max-file 3) to the compose stack
- [x] 2.2 Add stop_grace_period tuning for stateful and mail services (postgres, stalwart, sogo, opencloud, paperless)
- [x] 2.3 Add Makefile targets make prune and make logs-size for images/volumes/log hygiene
- [x] 2.4 Pin critical images by digest in .env.example and CI check (traefik, postgres, redis, memcached, stalwart, sogo)
- [x] 2.5 Add tmpfs mounts for ephemeral directories and read_only root filesystems where safe in docker-compose.yml

## 3. Right-sizing per tier

- [x] 3.1 Trim medium-tier reservations (collabora, opencloud, redis, memcached) to fit the 40G budget
- [x] 3.2 Trim small-tier reservations and verify soho stays within the 6G budget in profiles
- [x] 3.3 Adjust CPU allocations to tier ratios (soho 4c, small 8c, medium 16c) across profiles
- [x] 3.4 Add the per-tier services-may-run matrix documenting strip decisions to docs/perf
- [x] 3.5 Add hardened defaults init true, no-new-privileges and cap_drop where safe across services

## 4. Runtime tuning

- [x] 4.1 Add shm_size for postgres, opencloud, collabora and tika per tier
- [x] 4.2 Tune Postgres checkpoint, bgwriter and autovacuum parameters per tier in profiles
- [x] 4.3 Tune Redis lazy freeing and eviction and Memcached slab sizes per tier
- [x] 4.4 Scale PgBouncer pool sizes per tier (default_pool_size, max_client_conn)
- [x] 4.5 Add Traefik healthcheck and compression (gzip/brotli) middleware

## 5. Boot correctness

- [x] 5.1 Add depends_on service_healthy conditions for the mail overlay (stalwart, sogo)
- [x] 5.2 Add depends_on service_healthy conditions for the opencloud overlay
- [x] 5.3 Add depends_on service_healthy conditions for the paperless stack (gotenberg, tika)
- [x] 5.4 Add depends_on service_healthy conditions for invoice-ninja (postgres, stalwart)
- [x] 5.5 Add depends_on service_healthy conditions for chat and notes overlays (synapse, element, notes)

## 6. Benchmark layer

- [ ] 6.1 Create tests/07-bench/ harness (docker stats sampler, container boot timer, JSON output)
- [ ] 6.2 Add HTTP latency benchmark through Traefik for portal, opencloud and paperless endpoints
- [ ] 6.3 Add make bench target tying the benchmark harness together
- [ ] 6.4 Add CI static subset running budget assertions and config invariants
- [ ] 6.5 Write the docs/perf/benchmark-run.md before/after evidence template
- [ ] 6.6 Run make bench on a live small-tier host to Verify before/after evidence (manual)

## 7. Documentation and archive

- [x] 7.1 Write docs/PERFORMANCE.md covering per-tier budgets, tuning rationale and results
- [x] 7.2 Update README.md with a performance and operations section
- [x] 7.3 Update ROADMAP.md and VALIDATION.md with benchmark and budget notes
- [x] 7.4 Run the Layer 0 static check via tests/00-static/run.sh and fix any findings
- [x] 7.5 Final validation with openspec validate and archive the perf-efficiency-pass change
