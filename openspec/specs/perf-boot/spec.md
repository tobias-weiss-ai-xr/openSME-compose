## Purpose

Defines deterministic cold-start ordering: every overlay service waits on the
core services it depends on via healthconditioned `depends_on`, so the stack
boots in dependency order instead of racing, and every clustered service has
a healthcheck that reflects true readiness.

## ADDED Requirements

### Requirement: Overlay services wait on their dependencies

Every overlay (mail, opencloud, paperless, invoice-ninja, chat, notes) SHALL
declare `depends_on` with `condition: service_healthy` for the core services
it needs (postgres, redis, pgbouncer, stalwart as applicable).

#### Scenario: Stalwart waits for postgres

- **WHEN** the mail overlay starts
- **THEN** stalwart SHALL wait for `postgres: service_healthy` before
  starting

#### Scenario: SOGo waits for stalwart

- **WHEN** the mail overlay starts
- **THEN** sogo SHALL wait for stalwart healthy before starting

#### Scenario: Paperless workers wait for core

- **WHEN** the paperless overlay starts
- **THEN** paperless-ngx SHALL wait for postgres and redis healthy, and
  gotenberg/tika SHALL be reachable before OCR jobs begin

#### Scenario: Invoice Ninja waits for its stores

- **WHEN** the invoiceninja service starts
- **THEN** it SHALL wait for postgres healthy (and stalwart when email
  notifications are enabled)

#### Scenario: Notes waits on redis/postgres

- **WHEN** the notes overlay starts
- **THEN** notes-backend and y-provider SHALL wait for the stores they use

### Requirement: Core services expose true readiness

Postgres, PgBouncer, Redis, Memcached, Stalwart, OpenCloud and the portal
SHALL expose healthchecks matching real readiness (not mere process
liveness), so dependents never start against a half-ready backend.

#### Scenario: Portal readiness gates dependents

- **WHEN** the portal health endpoint is not yet ready
- **THEN** no dependent SHALL be started by compose
