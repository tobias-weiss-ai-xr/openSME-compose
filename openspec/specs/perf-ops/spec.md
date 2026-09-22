## Purpose

Defines the operational hygiene that keeps the stack efficient over months of
operation: capped and rotated logs, tuned shutdown grace, prune targets,
digest-pinned critical images, and tmpfs/read-only filesystem hygiene so disk
and processes stay bounded on finite SME VPS tiers.

## Requirements

### Requirement: All services cap and rotate logs

Every service SHALL have a `logging` block with `json-file` driver,
`max-size: 50m` and `max-file: 3` (set globally via compose defaults so new
overlays inherit it), bounding disk growth regardless of log churn.

#### Scenario: Log growth is bounded

- **WHEN** a chatty service runs continuously for 30 days
- **THEN** its on-disk logs SHALL not exceed configured caps
- **AND** older logs SHALL roll off per max-file

#### Scenario: New overlay inherits defaults

- **WHEN** a new service overlay is added without its own logging block
- **THEN** it SHALL still have capped logs via compose defaults

### Requirement: Shutdown is orderly with tuned grace periods

Stateful and mail services SHALL declare a `stop_grace_period` appropriate to
flush caches/queues (postgres, stalwart, sogo, opencloud, paperless) so
restarts are clean and fast, not forced.

#### Scenario: Postgres gets long enough grace

- **WHEN** `opensme-postgres` is stopped
- **THEN** its stop_grace_period SHALL be at least 60s

#### Scenario: Stalwart flushes queues before exit

- **WHEN** `opensme-stalwart` is stopped
- **THEN** its stop_grace_period SHALL exceed the default so queued mail
  flushes

### Requirement: Operators can prune and inspect log footprint

The Makefile SHALL provide `make prune` (docker system prune with
`--filter until`) and `make logs-size` (per-container log accounting) targets.

#### Scenario: Prune target exists

- **WHEN** `make prune` runs
- **THEN** it SHALL invoke docker system prune with an age filter

#### Scenario: Log size target exists

- **WHEN** `make logs-size` runs
- **THEN** it SHALL report per-container JSON log file sizes

### Requirement: Critical images are digest-pinned

Stable, well-known images (traefik, postgres, redis, memcached, stalwart,
sogo) SHALL be pinnable by digest via `.env.example`, with a CI check asserting
the pin exists when the corresponding env override is set.

#### Scenario: Digest pin is honored

- **WHEN** an operator sets the digest-pinned image variable
- **THEN** the service image SHALL resolve to that digest

#### Scenario: CI verifies pins

- **WHEN** the static CI job runs
- **THEN** it SHALL verify pinned images are referenced by digest

### Requirement: Ephemeral data uses tmpfs and read-only roots

Ephemeral directories (sessions, temp/OCR scratch, upload staging) SHALL use
tmpfs, and services that do not write to their root filesystem SHALL run
`read_only: true`, reducing disk churn and attack surface.

#### Scenario: Ephemeral scratch is tmpfs

- **WHEN** a service declares write-only scratch paths
- **THEN** those paths SHALL be tmpfs mounts, not named volumes

#### Scenario: Read-only root honoured where declared

- **WHEN** a service declares `read_only: true`
- **THEN** its root filesystem SHALL prevent writes
- **AND** only explicitly mounted tmpfs/volume paths accept writes
