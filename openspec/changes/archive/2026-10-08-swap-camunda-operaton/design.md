## Design

### Decision: Operaton as the engine distribution

Evaluated (2026-10): Operaton, CIB seven, Fluxnova, EximeeBPMS, Flowable,
Activiti, staying on C7 CE, and Camunda 8. Full analysis in the workspace
report `CAMUNDA-FORKS.md` (companion: `CAMUNDA-ANALYSIS.md`).

- **Operaton wins** for this stack: Apache 2.0 without open-core gates,
  community-owned (planned non-profit), the most active fork (monthly patch
  releases, half-yearly feature releases), API/model/DB-schema compatible
  with our 7.23 pin, and — decisive for compose — it publishes a maintained
  **standalone Tomcat distribution on Docker Hub** (the same packaging shape
  we run today).
- CIB seven is the runner-up; its free Community edition includes Camunda-7
  EE-grade ops features (instance migration, batch ops, audit logs). If those
  become needed, the REST-only contract (below) makes switching a one-line
  change.
- Fluxnova (FINOS/Linux Foundation, bank-backed) has the strongest long-term
  governance but no maintained container distribution yet — watchlist.
- Rejected: EximeeBPMS (single vendor, no image), orquieo (closed),
  Activiti (stalled), C7 CE (EOL, unpatched), Camunda 8 (paid production
  license + Elasticsearch footprint contradicts the single-container,
  shared-Postgres service pattern).

### Shape of the swap

Minimal-diff change, no new capabilities beyond codifying the existing
service as a spec:

1. `services/camunda.yml`: replace image; keep profile, networks, Postgres
   wiring, labels, healthcheck shape. Verify the Operaton image entrypoint
   honors the same `DB_*` datasource env contract (it inherits the upstream
   C7 entrypoint pattern); adjust only if names differ.
2. `.env.example`: point `CAMUNDA_IMAGE` at the pinned Operaton Tomcat tag.
3. Docs: rename Camunda-7 references to Operaton; note license + EOL
   rationale.

### Risks / notes

- **Tag pinning**: Operaton publishes versioned tags; pin a concrete
  `x.y.z` Tomcat tag, don't track `latest`.
- **Java script tasks**: C7 7.24+/Operaton dropped the legacy Nashorn
  engine (GraalVM JavaScript) — irrelevant to us today (no scripted
  delegates shipped), noted for future process authors.
- **Data**: profile deployments are treated as stateless-by-rebuild; the
  engine schema auto-updates across consecutive minor versions, so an
  existing `camunda` volume upgrades in place on first boot.
- **Security posture**: the whole point of the swap is resumed patch
  supply; monthly Operaton patch releases should be tracked like any other
  pinned-image dependency (MUTABLE_IMAGES policy documents the cadence).
