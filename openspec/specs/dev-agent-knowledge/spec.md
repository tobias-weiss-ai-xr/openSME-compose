## Purpose

Defines the embedded runbook knowledge base (`opensme-knowledge/`) that gives
the dev-agent durable knowledge of how the openSME stack fails and how to
remediate — shipped inside the Go binary via `//go:embed`.

## Requirements

### Requirement: Knowledge base ships embedded JSON runbooks

The agent SHALL embed `opensme-knowledge/*.json` at build time and expose
query APIs for runbook records of the form
`{service, symptom[], diagnosis, remediation[], flags}`.

#### Scenario: Runbooks are embedded in the binary

- **WHEN** the agent binary is built from the module
- **THEN** the JSON must not be readable from the container filesystem
- **AND** the internal/knowledge package SHALL load it via embedded FS

#### Scenario: Query by service returns records

- **WHEN** a client queries knowledge for `stalwart` or `postgres`
- **THEN** the seeded runbook entries for that service SHALL be returned

#### Scenario: Query by symptom returns diagnosis

- **WHEN** a symptom such as `OOMKilled`, `ImagePullBackOff` or
  `listener flap` is queried
- **THEN** the matching diagnosis and ordered remediation steps SHALL be returned

### Requirement: Seed runbooks cover the core services plus cross-cutting patterns

The knowledge base SHALL seed entries for traefik, postgres, zitadel,
stalwart, sogo, opencloud, invoice-ninja, paperless, operaton, and common
cross-cutting patterns (image-pull, port-in-use, disk-full, volume-permission,
healthcheck, restart-loop), each with at least one symptom, a diagnosis and
one remediation.

#### Scenario: Every core service has a runbook

- **WHEN** the seed data is validated (static check)
- **THEN** each of the core services SHALL have a record with a
  non-empty remediation list

#### Scenario: Cross-cutting runbooks cover common failures

- **WHEN** a query references a cross-cutting symptom (e.g. `image pull backoff`,
  `port already in use`, `no space left on device`)
- **THEN** the `common` runbook SHALL return a matching diagnosis and remediation

#### Scenario: Unknown service returns no match

- **WHEN** a query references a service with no runbook
- **THEN** the API SHALL return an empty result without error

### Requirement: Knowledge base is versioned and lintable

The JSON schema SHALL carry a version field and SHALL be parseable/lintable in
the Layer 0 static test so runbook drift or malformed entries fail CI.

#### Scenario: Malformed runbook fails static check

- **WHEN** a runbook JSON file does not conform to the schema
- **THEN** the Layer 0 static check SHALL report it as a failure
