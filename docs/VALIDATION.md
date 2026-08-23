# Validation

How the openSME Compose distribution is validated before release.

## Test layers

| Layer | Tooling | In CI |
|-------|---------|:---:|
| 0 · Static | yaml lint, env completeness, secret scan (`tests/00-static/`) | ✅ |
| 0 · Perf gate | `tests/00-static/check_perf.py` — budgets, limits, log caps, healthchecks | ✅ |
| 1 · Specs | spec compliance (`tests/01-specs`) | ✅ |
| 2 · Contracts | service/contract validation | ✅ |
| 3 · Container | image availability + contract checks per overlay | host |
| 4 · Integration | service-to-service API checks | host |
| 5 · E2E | Playwright flows through SSO | host |
| 6 · Security | CIS / hardening checks, exposed-port audit | host |
| 7 · Bench | `tests/07-bench/run_bench.py` — memory + p50/p95/p99 latency | optional (manual) |

Run everything locally: `make test-static`, `make test-all`, `make bench`.

## Static gate (what CI blocks)

`tests/run.py --static` must pass on every commit:

- every YAML overlay parses; every secret pattern absent from the tree
  (RFC1918/link-local IPs, host paths);
- every service has `deploy.resources.limits` (cpu+memory), a `json-file`
  logging cap (50m×3), and a healthcheck when long-running;
- reservation sums per tier ≤ budgets (soho 6G / small 20G / medium 40G);
- digest-pin variables documented in `.env.example`;
- spec + contract suites green.

## Perf budgets (current)

SOHO ~0.8G, Small ~3.4G, Medium ~8.0G Σ reservations — see
[docs/perf/baselines.md](docs/perf/baselines.md).

## Release checklist

1. `make test-static` green locally.
2. CI green on the branch (`static` + `leak-scan` jobs).
3. On a reference host: `make up` for each tier, `make test`, `make bench`
   (record results in `docs/perf/benchmark-run.md`).
4. `openspec validate` for any in-flight changes; archive when complete.
