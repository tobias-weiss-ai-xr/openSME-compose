## Context

The repo already has two Python monitoring agents under `monitoring/nix/`
(`dev_agent.py`, `predictive_agent`) and overlay files (`monitoring/dev-agent.yml`,
`monitoring/predictive-agent.yml`). They use a read-only Docker socket, an
HTTP health/metrics surface, and an optional LLM backend (ollama/saia/tud/openai).
They observe and analyse; the new bot should **know the stack** (runbook KB),
**act** (heal with consent), **preserve privacy** (strip-then-review), and
integrate with the pi tooling used to maintain this repo.

Design goals: tiny footprint (Go binary, ~128 MB), minimal moving parts, no
new infrastructure (no DB — embedded JSON + state dir), everything env-driven,
safe by default (read-only socket, dry-run healing, LLM off unless configured).

## Goals / Non-Goals

**Goals:**
- ~128 MB RAM budget; single small Go binary; `restart: "no"` one-shot or
  interval-triggered via systemd/per-task, not a long-lived always-on pod.
- Embedded JSON runbook KB covering the 8 core services, queried by
  service/symptom.
- Read-only Docker socket; healing via `docker` CLI subprocess with dry-run
  default and confirm flag.
- Anonymizer that strips secrets/IPs/hostnames/user paths before any
  outbound LLM call or knowledge contribution, with an auditable evidence log.
- pi extension: `/status`, `/heal`, `/diag` backed by the agent REST API.
- 7-layer test framework treats the agent like any other service (Layer 0
  static, Layer 2 container).

**Non-Goals:**
- Not a Kubernetes operator (K8s variant lives in the Nix/Hosted deployment).
- No web UI, no multi-user, no auth of its own (it binds on a private/unexposed
  port inside the compose network; use Traefik rules only if exposed).
- No write access to service volumes, no password/key management.
- Not a metrics store; Prometheus/state serialization stays with the existing
  predictive-agent.

## Decisions

1. **Go over Python** — single static binary, no interpreter in the final
   image, trivially meets the 128 MB budget (Python agents show 128–250 MB).
   Repeatable builds, easy multi-stage Dockerfile.
   *Alternative considered:* extend `dev_agent.py`; rejected — muddies the
   observation agent and the acting bot, and the Go binary is the stated target.

2. **Embedded JSON knowledge base** (`opensme-knowledge/*.json`,
   `//go:embed`) — shipped inside the binary, no runtime DB. Read-only
   runbook entries: `{service, symptom[], diagnosis, remediation[], flags}`.
   *Alternative:* SQLite; rejected — no mutable state needed.

3. **Checker via `docker` CLI subprocess** over a read-only
   `/var/run/docker.sock` mount — reuse of the pattern already in
   `docker_collector.py`; no SDK dependency, works on any base image.
   Detects: restarting/exited/OOM/ImagePullBackOff states, restart counts,
   resource pressure (stats), log error spikes.

4. **Healer with dry-run default** — actions: `restart <container>`,
   `prune` (volumes/networks dry-run only), `wait`. Requires `--allow`/env
   `DEV_AGENT_ALLOW_HEAL=true` to actually execute; always logs a receipt.

5. **Strip-then-review privacy** — one `anonymizer` package: before an LLM
   call, replace secrets/API keys `***`, scrub RFC1918/link-local IPs,
   internal hostnames, and user home paths; write what was stripped to the
   `evidence/` log. Contribution back to the repo is opt-in and only ships the
   (already stripped) symptom→remediation pattern, never raw logs.

6. **REST API** — stdlib `net/http`: `GET /status`, `GET /healthz`,
   `GET /ready`, `GET /history`, `GET /evidence`, `POST /heal`. Binds on
   `0.0.0.0:8081` inside the compose network only.

7. **LLM analysis off by default** — `DEV_AGENT_LLM_BACKEND=none`; opt-in
   via `ollama|saia|tud|openai` + URL/key envs (key reads only, never logged).

8. **Pi extension** — `.pi/extensions/opensme-dev-agent.ts` using pi's
   extension API: registers `com.opensme.agent`, commands `/status`, `/heal`,
   `/diag` that call the agent over the compose network.

## Risks / Trade-offs

- **Restart race**: healing a container that is mid-startup can churn;
  mitigated by restart-count backoff and dry-run receipts.
- **Socket trust**: read-only mount still exposes container metadata; the bot
  must never echo env/secrets into logs (anonymizer enforces).
- **One-shot `restart: "no"`** means scheduled trigger lives elsewhere
  (Makefile/cron/pi); documented — a long-lived watcher is a separate profile.
- **Embedded KB staleness**: runbooks can go stale; JSON format is versioned
  and CI-lintable, contributions add entries via the privacy pipeline.
