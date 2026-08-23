## Purpose

Defines how the dev-maintenance bot is packaged and operated in this Compose
deployment: sidecar service with a read-only Docker socket and private state
volume, `DEV_AGENT_*` env and `.env.example` entries, Makefile targets, a
multi-stage Dockerfile, and a RAM budget gate so the agent stays tiny.

## ADDED Requirements

### Requirement: Compose sidecar runs with read-only Docker socket

A `dev-agent` service SHALL be available in `monitoring/dev-agent.yml` that
mounts `/var/run/docker.sock` read-only, uses a private state volume, binds
its API on the compose network only, and defaults to `restart: "no"`.

#### Scenario: Socket is mounted read-only

- **WHEN** the `dev-agent` container starts
- **THEN** `/var/run/docker.sock` SHALL be mounted `:ro`
- **AND** the agent SHALL be able to run read-only docker commands

#### Scenario: API is not exposed on host by default

- **WHEN** the compose service applies
- **THEN** no host port SHALL be published for the agent API unless a profile
  explicitly opts in

#### Scenario: One-shot operation

- **WHEN** the stack is brought up with the sidecar enabled
- **THEN** the agent SHALL perform a reconcile pass and exit cleanly
  (`restart: "no"`)

### Requirement: Environment and ops integration

The agent SHALL read `DEV_AGENT_*` variables documented in `.env.example`, and
the deployment SHALL provide Makefile targets `agent-build` and `agent-status`.

#### Scenario: Env reference is complete

- **WHEN** `.env.example` is validated by the Layer 0 env check
- **THEN** every `DEV_AGENT_*` variable the agent reads SHALL be documented

#### Scenario: Makefile targets exist

- **WHEN** `make help` or inspection of the Makefile runs
- **THEN** `agent-build` (build the image) and `agent-status` (query
  `GET /status`) SHALL be present

### Requirement: Image is small and within RAM budget

The agent image SHALL be built with a multi-stage Dockerfile producing a
minimal runtime image, and the RAM budget gate (via
`tests/00-static/sum-memory.awk`) SHALL verify the agent stays at or under
~128 MB.

#### Scenario: Multi-stage build

- **WHEN** the Dockerfile is applied
- **THEN** the build stage SHALL compile the static Go binary and the runtime
  stage SHALL contain only that binary plus required runtime files

#### Scenario: RAM budget gate passes

- **WHEN** the static suite runs the RAM budget check
- **THEN** the dev-agent estimated memory SHALL be ≤ 128 MB
