## Purpose

Defines the measurement layer that makes this change's outcomes verifiable: a
`tests/07-bench/` harness measuring steady-state memory, container boot time
and HTTP latency through Traefik; a `make bench` entrypoint; a static budget
subset that runs in CI; and a documented before/after evidence template.

## ADDED Requirements

### Requirement: Benchmark harness measures memory, boot and latency

`tests/07-bench/` SHALL provide a sampler that records per-container
steady-state memory (docker stats), a boot timer per container (create→ready),
and HTTP latency percentiles (p50/p95/p99) through Traefik for the portal,
opencloud and paperless endpoints, emitting JSON.

#### Scenario: Memory snapshot is captured

- **WHEN** the harness runs against a live stack
- **THEN** per-container memory from docker stats SHALL be written to the
  JSON output

#### Scenario: Boot time is measured per container

- **WHEN** the harness performs a controlled restart
- **THEN** elapsed time from start to healthy SHALL be recorded (p50/p95 over
  runs)

#### Scenario: Latency percentiles are recorded

- **WHEN** the latency probe runs against portal, opencloud and paperless
- **THEN** p50/p95/p99 latencies over the probe window SHALL be in the output

### Requirement: make bench runs the harness

A `make bench` target SHALL run the harness against the active stack and write
the evidence to `docs/perf/benchmark-run.md`.

#### Scenario: make bench produces evidence

- **WHEN** `make bench` runs on a live host
- **THEN** it SHALL produce a timestamped benchmark-run markdown with the JSON
  evidence

### Requirement: CI runs only the static budget subset

The CI static job SHALL run the budget assertions (per-tier reservation sums)
and config invariants (limits/logging/healthcheck), and SHALL NOT require a
live stack.

#### Scenario: CI asserts budgets without a host

- **WHEN** the CI static job runs
- **THEN** it SHALL pass/fail on merged-config budget and invariant checks
- **AND** SHALL skip live latency/memory probes

### Requirement: Before/after evidence template exists

`docs/perf/benchmark-run.md` SHALL define the template (host, tier, commit,
date, memory table, boot table, latency table) so before/after comparisons are
apples-to-apples.

#### Scenario: Baseline and result are comparable

- **WHEN** two benchmark runs exist for the same tier
- **THEN** they SHALL reference tier, commit and host so a reviewer can tell
  before from after
