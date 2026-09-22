## Purpose

Defines the dev maintenance bot — a small Go binary (~128 MB budget) that
watches openSME containers via a read-only Docker socket, knows how this
stack fails via an embedded runbook knowledge base, and remediates with
explicit consent while never leaking private data.

## Requirements

### Requirement: Agent runs as a small Go binary with configurable interval

The dev-agent SHALL be a single static Go binary whose behaviour is driven by
`DEV_AGENT_*` environment variables (watch list, reconcile interval, state
dir, LLM backend, allow-heal flag) with sane defaults, and SHALL fit within an
estimated ~128 MB RAM budget.

#### Scenario: Env-driven defaults are applied

- **WHEN** the agent starts with no `DEV_AGENT_*` variables set
- **THEN** it SHALL use documented defaults (interval 60s, watch
  `opensme`, LLM backend `none`, allow-heal `false`)
- **AND** it SHALL log the effective configuration without echoing secrets

### Requirement: Checker detects unhealthy containers via read-only Docker socket

The agent SHALL classify containers as unhealthy when state, health check,
restart count or OOM status indicate a problem, using `docker` CLI subprocesses
over a read-only `/var/run/docker.sock` mount.

#### Scenario: Restarting container is detected

- **WHEN** a watched container reports state `restarting` or `exited` with a
  non-zero restart count
- **THEN** the agent SHALL mark it unhealthy and record the symptom in `/status`

#### Scenario: Socket is used read-only

- **WHEN** the agent inspects containers
- **THEN** it SHALL only invoke read commands (`docker ps`, `docker inspect`,
  `docker logs`, `docker stats`) and never mutate containers through the socket

### Requirement: REST API exposes status and heals with consent

The agent SHALL expose `GET /status`, `GET /healthz`, `GET /ready`,
`GET /history`, `GET /evidence`, and `POST /heal` on a private port inside the
compose network, with healing gated by `DEV_AGENT_ALLOW_HEAL`.

#### Scenario: Heal is rejected without consent

- **WHEN** a `POST /heal` is received while `DEV_AGENT_ALLOW_HEAL` is `false`
  or unset
- **THEN** the agent SHALL return a dry-run receipt listing the would-be action
- **AND** SHALL NOT execute the remediation

#### Scenario: Evidence of every heal is retained

- **WHEN** a heal action completes (dry-run or real)
- **THEN** the agent SHALL append a receipt to `/history` and `/evidence`

### Requirement: Optional LLM analysis uses only anonymized context

The agent MAY send container context to an LLM backend (`ollama|saia|tud|openai`,
off by default) for root-cause analysis, but SHALL only ever send context that
passed through the anonymizer.

#### Scenario: LLM is off by default

- **WHEN** `DEV_AGENT_LLM_BACKEND` is unset or `none`
- **THEN** no analysis request SHALL be made to any external endpoint

#### Scenario: LLM receives no raw secrets

- **WHEN** an LLM analysis is triggered
- **THEN** every field sent SHALL have secrets, IPs, hostnames and user paths
  stripped by the anonymizer first

### Requirement: Signal-safe shutdown and one-shot operation

The agent SHALL handle `SIGTERM`/`SIGINT` by persisting pending history and
exiting cleanly, and SHALL support running as a `restart: "no"` one-shot
container that performs a reconcile pass and exits.

#### Scenario: SIGTERM persists history

- **WHEN** `SIGTERM` is received
- **THEN** pending history/cache SHALL be written to the state dir before exit
