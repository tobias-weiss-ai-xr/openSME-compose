# Contributing runbooks to opensme-knowledge

Runbook entries learned from real incidents are welcome — under the
strip-then-review policy (dev-agent-privacy spec):

1. **Strip first.** Only submit patterns that already passed the agent's
   anonymizer: no secrets, no IPs, no hostnames, no user paths. The
   agent's `/evidence` log records every strip operation — attach the
   pattern, never the raw log.
2. **Contribution form.** A stripped contribution is
   `{service, symptoms[], diagnosis, remediation[]}` — diagnosis/remediation
   must be reproducible from the stripped pattern alone. If a reader would
   need the raw values to follow the fix, it is not stripped enough.
3. **Review gate.** Contributions are merged by a human reviewer who checks
   the record against this policy; CI (Layer 0 `check_agent.py`) only
   validates schema and coverage, not privacy.
4. **Flags.** Mark mutating remediation steps with `requires-consent` so
   the healer only ever runs them with `DEV_AGENT_ALLOW_HEAL=true`.
