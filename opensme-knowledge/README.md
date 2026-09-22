# opensme-knowledge — embedded runbook knowledge base

JSON runbooks for the openSME core services, embedded into the
`opensme-dev-agent` Go binary at build time (`//go:embed`) and queryable by
service and symptom.

## Schema (version 1)

One file per service, `<service>.json`:

```json
{
  "schema": 1,
  "service": "stalwart",
  "runbooks": [
    {
      "symptoms": ["listener flapping", "accept loop restarts"],
      "diagnosis": "Why this happens in THIS stack",
      "remediation": ["ordered steps the operator (or healer) can run"],
      "flags": ["requires-consent"]
    }
  ]
}
```

- `schema` — integer, currently always `1`. A mismatch fails the load.
- `service` — canonical service name (file name must match).
- `symptoms` — lowercase substrings matched against checker-detected
  symptoms and container log lines.
- `remediation` — ordered steps; steps marked actionable in `flags`
  may be executed by the healer with explicit consent.
- `flags` — optional. `requires-consent` = the step mutates state and is
  only run by the healer when `DEV_AGENT_ALLOW_HEAL=true`.

## Rules

- Runbooks are **read-only knowledge**: no credentials, no customer data.
- Entries contributed from agent sessions must pass the anonymization
  pipeline first (see `dev-agent-privacy` spec) and ship as stripped
  symptom→remediation patterns only.
- A malformed file (bad JSON, unknown schema, empty service) fails the
  agent startup and the Layer 0 static check.
