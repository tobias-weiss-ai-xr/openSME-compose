## Purpose

Defines the pi-extension integration: `.pi/extensions/opensme-dev-agent.ts`
registers the agent with pi (capability `com.opensme.agent`) and exposes
`/status`, `/heal` and `/diag` commands that call the agent REST API, so the
agent driving this repository can operate the maintenance bot directly.

## ADDED Requirements

### Requirement: Extension registers the agent with pi

The pi extension SHALL use `registerCommand` to register `/status`, `/heal`
and `/diag`, and SHALL advertise the capability `com.opensme.agent` for agent
discovery.

#### Scenario: Commands are registered

- **WHEN** pi loads the extension
- **THEN** `/status`, `/heal` and `/diag` SHALL be registered as commands

#### Scenario: Agent is discoverable

- **WHEN** pi queries available capabilities
- **THEN** the extension SHALL report `com.opensme.agent`

### Requirement: /status command surfaces agent state

The `/status` command SHALL call the agent `GET /status` endpoint and render
container health, last reconcile time, and any flagged symptoms.

#### Scenario: Healthy stack renders healthy

- **WHEN** `/status` runs and all watched containers are healthy
- **THEN** the command SHALL report the healthy set and last reconcile time

#### Scenario: Unhealthy container is surfaced

- **WHEN** `/status` runs and a watched container is unhealthy
- **THEN** the command SHALL name the container and its symptom

### Requirement: /heal command requires explicit confirmation

The `/heal` command SHALL call `POST /heal` but first require explicit user
confirmation, and SHALL always report the receipt (real or dry-run).

#### Scenario: Heal without confirmation is refused

- **WHEN** `/heal <container>` is invoked without confirmation
- **THEN** the command SHALL abort and print the would-be action without
  calling `POST /heal`

#### Scenario: Confirmed heal emits a receipt

- **WHEN** the user confirms the heal
- **THEN** the command SHALL call `POST /heal` and print the returned receipt

### Requirement: /diag command gathers and triages symptoms

The `/diag` command SHALL gather container symptoms via the checker, look up
diagnoses in the embedded knowledge base, and present symptom → diagnosis →
remediation, forcing the payload through the anonymizer.

#### Scenario: Diag returns knowledge-backed triage

- **WHEN** `/diag <service>` runs for a service with a runbook entry
- **THEN** the command SHALL present the matched symptom, diagnosis and
  ordered remediation steps

#### Scenario: Diag never emits private fields

- **WHEN** `/diag` produces output
- **THEN** secrets, private IPs, hostnames and user paths SHALL be absent
