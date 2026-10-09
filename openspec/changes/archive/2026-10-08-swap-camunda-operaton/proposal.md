## Why

The stack runs Camunda Platform 7 (`camunda/camunda-bpm-platform:tomcat-7.23.0`,
behind `--profile camunda`) as its optional BPMN workflow engine. Camunda 7
Community Edition reached end of life in October 2025 (final release 7.24,
repository archived November 2025): no further releases, **no security
patches**. The pinned 7.23.0 image is already one minor behind and now
frozen forever. Every additional month on it accumulates unpatched CVEs in a
user-facing web application (Tomcat + Cockpit/Tasklist).

The community successor is **Operaton** — a community-owned Apache 2.0 fork of
Camunda 7 with full API, model, and database-schema compatibility (forked
before EOL, 1.0 in Nov 2025, monthly patch releases, half-yearly feature
releases, maintained Tomcat distribution on Docker Hub). Swapping the image is
the shortest path back to a maintained, truly free production license.

## What Changes

- Swap the BPM engine image: `camunda/camunda-bpm-platform:tomcat-7.23.0`
  → pinned `operaton/operaton` Tomcat distribution tag.
- Keep everything else intact: `--profile camunda` gating, dedicated
  PostgreSQL database/user, Traefik route `bpm.<domain>` → `:8080`.
- Verify/align datasource env wiring with the Operaton image entrypoint
  ( Operaton ships the same `DB_*`-driven entrypoint pattern as upstream C7).
- No breaking change for consumers: BPMN 2.0/DMN models, REST API shape, and
  DB schema are compatible (7.23 → 7.24 → Operaton is the documented
  migration path).
- **Contract change for future integrations:** other services MUST integrate
  with the engine REST API only — no `org.camunda.*`/`org.operaton.*` Java API
  dependencies in stack-owned images — so the engine remains swappable via
  one env var.

## Capabilities

### New Capabilities

- `bpm-engine`: optional BPMN/DMN workflow engine service — Operaton
  (successor of Camunda 7 CE) as a single-container Tomcat distribution with
  PostgreSQL persistence, Traefik routing, profile gating, and REST-only
  integration contract.

### Modified Capabilities

(none — the Camunda service was never specified; this change introduces its
spec in post-swap form)

## Impact

- `services/camunda.yml` — image reference (and env verification)
- `.env.example` — `CAMUNDA_IMAGE` default/comment update
- `docs/` — service documentation mentions Camunda 7; update to Operaton
- `tests/run.py` — any camunda-specific checks (static/health) must pass
  against the new image
- No data migration needed for a fresh profile deployment; existing volumes
  upgrade in place via engine schema auto-update (compatibility with
  consecutive minor versions is a documented Operaton guarantee)
- License posture: Apache 2.0 with no open-core production gates — resolved
  the "EOL/unpatched" risk without introducing Camunda 8's paid-production
  license or its Elasticsearch footprint
