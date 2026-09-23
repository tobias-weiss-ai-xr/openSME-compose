## Purpose

Defines the privacy posture of the dev-agent: a strip-then-review pipeline that
removes secrets, private IPs, internal hostnames and user paths from every
outbound payload (LLM analysis or knowledge contribution), records what was
stripped in an auditable evidence log, and governs privacy-preserving
contribution back to the project.

## ADDED Requirements

### Requirement: Anonymizer strips private fields before any outbound call

The agent SHALL run every outbound payload (LLM context or knowledge
contribution) through an anonymizer that replaces API keys/secrets with
`***`, scrubs RFC1918 and link-local IPv4 addresses, replaces internal
hostnames, and removes local user filesystem paths.

#### Scenario: Secrets are masked in LLM context

- **WHEN** container environment or log context contains a long secret or
  `KEY=value` pair
- **THEN** the outbound payload SHALL contain `***` in place of the value
- **AND** the raw value SHALL NOT appear in the request body

#### Scenario: Private IPs are scrubbed

- **WHEN** outbound context contains a private or link-local IPv4 address
- **THEN** the value SHALL be replaced with a neutral placeholder

#### Scenario: Host paths are removed

- **WHEN** outbound context contains a local user path (e.g. `/home/<user>/…`)
- **THEN** the path SHALL be replaced with a neutral placeholder

### Requirement: Evidence log records every strip operation

The agent SHALL append to an evidence log every strip operation, recording
what class of field was stripped (secret/IP/hostname/path), where it
occurred, and when — without storing the raw value.

#### Scenario: Evidence endpoint lists strip operations

- **WHEN** `GET /evidence` is requested
- **THEN** it SHALL return the timestamped strip-operation records

#### Scenario: Raw values never enter the evidence log

- **WHEN** an anonymizer records a strip operation
- **THEN** the raw stripped value SHALL NOT be written to the evidence log

### Requirement: Contribution back to the project is opt-in and sanitized

Contributing a new runbook pattern back into `opensme-knowledge/` SHALL be
opt-in, SHALL take effect only after human review, and SHALL contain only the
(stripped) symptom→diagnosis→remediation pattern — never raw logs, IPs,
hostnames, or keys.

#### Scenario: Contribution carries only the stripped pattern

- **WHEN** an operator approves a contribution
- **THEN** the exported record SHALL contain the anonymized symptom, diagnosis
  and remediation only
- **AND** SHALL fail validation if any private field is present

#### Scenario: Contribution requires review

- **WHEN** the agent generates a candidate runbook entry
- **THEN** it SHALL be staged for review and SHALL NOT auto-write to
  `opensme-knowledge/`
