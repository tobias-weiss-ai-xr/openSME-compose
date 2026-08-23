# openSME — Performance & Efficiency

This directory holds the performance baselines, tier decisions, and the
benchmark protocol for the openSME Compose stack.

## Per-tier “what may run” matrix

What each tier is allowed to run. Everything not listed here should be
**deleted or disabled** on that tier, not just resized — smaller footprint is
the goal (`perf-efficiency-pass` spec `perf-budgets`).

| Service | SOHO (4c/8G) | Small (8c/24G) | Medium (16c/48G) | Activation |
|---------|:---:|:---:|:---:|------------|
| Traefik (proxy) | ✅ | ✅ | ✅ | core |
| PostgreSQL (+PqBouncer) | ✅ (no pgbouncer) | ✅ | ✅ | core |
| Redis / Memcached | ✅ (cache-only) | ✅ | ✅ | core |
| Rust portal | ✅ | ✅ | ✅ | core |
| Zitadel (SSO) | ✅ | ✅ | ✅ | idm/zitadel.yml |
| Casdoor (alt SSO) | ⭕ | 🌓 | 🌓 | idm/casdoor.yml (alternative to Zitadel) |
| OpenCloud files | ⭕ | ✅ | ✅ | opencloud/opencloud.yml |
| MinIO (OC storage) | ⭕ | 🌓 | ✅ | opencloud/minio.yml |
| Collabora (online office) | ⭕ | ⭕* | ✅ | *default off on Small (`donotstart`); enable deliberately |
| Stalwart (mail) | ⭕ | ⭕* | ✅ | *default off on Small; enable via profile |
| SOGo (webmail/calendar) | ⭕ | ⭕* | ✅ | *default off on Small; enable via profile |
| Invoice Ninja | ⭕ | ✅ | ✅ | `--profile invoice` |
| Paperless-ngx (+Gotenberg) | ⭕ | ✅ | ✅ | `--profile paperless` |
| Paperless-Tika | ⭕ | 🌓 | 🌓 | `--profile tika` (OCR language packs) |
| Synapse (chat) | ⭕ | 🌓 | 🌓 | `--profile chat` |
| Element Web | ⭕ | 🌓 | 🌓 | `--profile element` |
| Notes / Impress | ⭕ | ⭕ | ⭕ | `--profile notes` (low adoption) |
| CryptPad | ⭕ | 🌓 | 🌓 | `--profile collab` |
| dev-agent / predictive-agent | ✅ (tiny) | ✅ | ✅ | monitoring/ |

- ``⭕` = not started by default; ``🌓`` = opt-in via profile/COMPOSE_PROFILES;
  ``✅`` = runs with the tier.
- SOHO is deliberately core-only: portal, SSO, proxy, DB, caches.
- Small runs opencloud + invoicing + paperless; **mail and online-office are
  disabled by default** (see `profiles/small.yml`) — enable only if you truly
  need 8c/24G to cover them.

## Reservation budgets (enforced in CI)

| Tier | Σ reservations | Budget | Status |
|------|---------------|--------|--------|
| soho  | ≤ ~0.8G | 6G  | `tests/00-static/check_perf.py` |
| small | ≤ ~3.4G | 20G | `tests/00-static/check_perf.py` |
| medium| ≤ ~8G   | 40G | `tests/00-static/check_perf.py` |

Regenerate the detailed tables:

```bash
python3 tests/00-static/check_perf.py --write-baselines   # -> docs/perf/baselines.md
```

## Benchmark protocol (before/after)

`make bench` runs `tests/07-bench/run_bench.py` against a **live stack** and
writes `docs/perf/benchmark-run.md` + a JSON snapshot. Outside a deployed
host it is a harmless no-op (exits 0).

To compare before/after apples-to-apples:

1. Pin the **same host** and record the **git commit** and **tier**.
2. Run the baseline **before** the change: `git stash && make up && make bench`
   (save `docs/perf/benchmark-<ts>.json`), then restore.
3. Apply the change, redeploy, run `make bench` again.
4. Compare steady-state memory and p95/p99 latency from the JSON snapshots.
5. CI enforces the static invariants (budgets + limits + logging + health)
   on every run; live numbers are advisory evidence, not the gate.

## Log retention & disk hygiene

- Every service logs via `json-file` with `max-size: 50m` / `max-file: 3`
  (compose `x-logging` anchor) — disk growth is bounded.
- `make logs-size` → per-container JSON log footprint.
- `make prune` → `docker system prune --filter until=72h` (images/build
  cache/networks; volumes untouched).
- Recommended daemon default (belt-and-braces for one-shots and ad-hoc
  containers), in `/etc/docker/daemon.json`:
  ```json
  { "log-driver": "json-file",
    "log-opts": { "max-size": "50m", "max-file": "3" } }
  ```
