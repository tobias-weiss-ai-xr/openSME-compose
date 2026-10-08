## Purpose

Defines the optional BPMN/DMN workflow engine service of the stack: a
single-container Operaton Spring Boot distribution (community successor of
Camunda 7 CE) with PostgreSQL persistence, Traefik routing, profile gating,
and a REST-only integration contract. The engine is a pluggable component:
any compatible fork must be replaceable by changing the image env var.

## ADDED Requirements

### Requirement: Optional BPM engine service behind a profile

The stack SHALL provide the BPM engine as an optional service gated behind a
dedicate compose profile (`camunda`), so deployments without process
automation do not run it.

#### Scenario: Engine absent without profile

- **WHEN** the stack is deployed without the `camunda` profile
- **THEN** no engine container, engine database, or engine route exists

#### Scenario: Engine present with profile

- **WHEN** the stack is deployed with the `camunda` profile
- **THEN** exactly one engine container SHALL run from a pinned image tag

### Requirement: Maintained Apache-2.0 engine distribution

The engine image SHALL be a community-maintained Apache 2.0 distribution of
the Camunda 7 engine lineage (Operaton) that is under active maintenance
(patch releases available), and the image reference SHALL be pinned to an
immutable tag.

#### Scenario: No EOL/unpatched engine image

- **WHEN** the service definition is reviewed
- **THEN** the image MUST NOT originate from an archived/end-of-life
  upstream (`camunda/camunda-bpm-platform`)
- **AND** the pinned tag MUST correspond to a release published within the
  distribution's supported window

#### Scenario: Pinned and documented

- **WHEN** the deployment is built
- **THEN** the engine image is resolved from the `CAMUNDA_IMAGE` env var
- **AND** the default/rolling-line behavior is documented in `.env.example`

### Requirement: PostgreSQL persistence

The engine SHALL persist all process state (BPMN/DMN/history) in a dedicated
PostgreSQL database and user, separate from other services, backed by a
persistent volume.

#### Scenario: State survives restart

- **WHEN** the engine container is recreated
- **THEN** deployed process definitions and history remain available
- **AND** engine credentials are supplied via secret-style env vars, never
  hardcoded in compose files

### Requirement: Traefik routing

The engine web applications (Cockpit, Tasklist, Admin, REST API) SHALL be
reachable through the stack's Traefik router at `bpm.<domain>` → engine
port `8080`, behind the standard middleware chain.

#### Scenario: Webapps reachable via route

- **WHEN** the profile is deployed and DNS resolves `bpm.<domain>`
- **THEN** the engine web login is served over HTTPS through Traefik

### Requirement: REST-only integration contract

Stack-owned services SHALL integrate with the engine exclusively via its
HTTP REST API. Stack-owned images MUST NOT bundle engine Java API
dependencies (`org.camunda.*` or `org.operaton.*`), so the engine stays
swappable between compatible distributions by changing the image env var.

#### Scenario: Consumer uses REST only

- **WHEN** a stack service drives workflow processes
- **THEN** it communicates over the engine REST API
- **AND** its image contains no engine Java client libraries

#### Scenario: Fork swap is non-breaking

- **WHEN** `CAMUNDA_IMAGE` is changed to a REST-compatible engine
  distribution (e.g. a C7-lineage fork) with the same API shape
- **THEN** no stack-owned image requires a rebuild
