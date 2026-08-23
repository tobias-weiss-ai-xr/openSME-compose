## Why

openSME today ships monitoring agents (a Python `dev-agent` and a
`predictive-agent`) that watch containers via the Docker socket and send
context to an LLM for root-cause analysis. They observe and explain, but they
do not **act**, and they carry no durable knowledge about how this stack fails
or how to fix it.

Maintaining a Compose stack across `soho`/`small`/`medium` tiers means the same
problems recur — PostgreSQL out of memory, Stalwart listener flapping, SOGo not
matching on OIDC, Traefik ACME rate limits, Paperless-Gotenberg timeouts. Those
are not novel; they are *learned* problems. The operator should not have to
re-derive them every time.

We need a small dev/maintenance bot that:
- knows how this specific stack fails (an embedded knowledge base),
- detects symptoms (container health, logs, resource pressure) via a
  read-only Docker socket,
- proposes and — with consent — executes remediation actions,
- runs with a tiny footprint (Go binary, ~128 MB budget) as a one-shot
  `restart: "no"` container,
- and only ever sends *anonymized* context to an LLM, preserving privacy of the
  data flowing through the stack.

Additionally, the operator uses a pi-based toolchain; a first-class pi
extension (`/status`, `/heal`, `/diag`) makes the bot usable from the very
agent that maintains this repository.

## What Changes

- **New Go module `opensme-dev-agent/`** — a small (~128 MB) maintenance bot:
  `internal/config`, `internal/knowledge`, `internal/checker`,
  `internal/healer`, `internal/api`.
- **Embedded knowledge base `opensme-knowledge/`** — JSON runbook entries per
  core service (traefik, postgres, casdoor/zitadel, stalwart, sogo, opencloud,
  invoice-ninja, paperless): symptoms → likely cause → remediation.
- **Checker** — reads container state via read-only Docker socket, detects
  unhealthy/restarting/OOM containers and resource pressure.
- **Healer** — remediation actions (restart, prune, wait) with dry-run default
  and explicit consent.
- **Anonymizer (strip-then-review)** — before anything leaves the host for LLM
  analysis or knowledge contribution, strip secrets/IPs/hostnames/user paths
  and keep a review/evidence log of what was removed.
- **REST API + LLM integration** — `/status`, `/healthz`, `/ready`,
  `/history`, `/evidence`, `/heal`; optional LLM root-cause analysis
  (ollama/saia/tud/openai via env, default off).
- **Compose integration** — `dev-agent` service in `monitoring/`, read-only
  `/var/run/docker.sock`, state volume, `restart: "no"`, `DEV_AGENT_*` env in
  `.env.example`, `Makefile` targets (`agent-build`, `agent-status`), RAM
  budget check via `tests/00-static/sum-memory.awk`.
- **pi extension `.pi/extensions/opensme-dev-agent.ts`** — registers the agent
  (`com.opensme.agent`) and `/status`, `/heal`, `/diag` commands.

## Capabilities

### New Capabilities

- `dev-agent`: core maintenance bot — Go binary, health checking, healing, REST API, LLM analysis
- `dev-agent-knowledge`: embedded JSON runbook knowledge base for the openSME stack
- `dev-agent-privacy`: strip-then-review anonymization + evidence log + contribution policy
- `dev-agent-compose`: Compose/ops integration — sidecar, Makefile targets, .env, RAM budget
- `dev-agent-extensions`: pi extension with agent discovery and /status /heal /diag commands

### Modified Capabilities

(none — the existing Python `monitoring/dev-agent.yml` remains, this is additive)

## Impact

- New: `opensme-dev-agent/` (Go module), `opensme-knowledge/`, `.pi/extensions/opensme-dev-agent.ts`
- Modified: `docker-compose.yml`/`monitoring/dev-agent.yml` (optional sidecar),
  `.env.example`, `Makefile`, `tests/00-static/`, `tests/02-container/`, `README.md`
- No change to core services, SSO, or data planes. The bot only reads via the
  Docker socket and writes a private state volume; it never mounts service data.
