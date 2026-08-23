## Purpose

Defines per-tier resource budgets for the three openSME tiers and the
Layer-0 invariant checks that keep them honest: every service must declare
limits, a logging cap, and a healthcheck, and each tier must fit its
documented reservation budget.

## ADDED Requirements

### Requirement: Every tier fits its reservation budget

Each tier SHALL keep the sum of `deploy.resources.reservations.memory` at or
below a documented budget: soho ≤ 6 GB (8G host), small ≤ 20 GB (24G host),
medium ≤ 40 GB (48G host), with headroom for OS and Docker.

#### Scenario: SOHO render fits budget

- **WHEN** the merged soho config is rendered with all its overlays
- **THEN** the sum of memory reservations SHALL be ≤ 6 GB

#### Scenario: Small render fits budget

- **WHEN** the merged small config is rendered with core, opencloud, mail,
  invoicing and paperless overlays
- **THEN** the sum of memory reservations SHALL be ≤ 20 GB

#### Scenario: Medium render fits budget

- **WHEN** the merged medium config is rendered with all overlays including
  chat and collaboration
- **THEN** the sum of memory reservations SHALL be ≤ 40 GB

### Requirement: Every service declares resource limits

Every compose service in every profile SHALL declare `deploy.resources.limits`
(cpus and memory), and the Layer 0 static check SHALL fail when a service
lacks them.

#### Scenario: Service without limits fails static check

- **WHEN** a compose service has no `deploy.resources.limits.memory` or
  `cpus`
- **THEN** the Layer 0 static check SHALL report it as a failure

### Requirement: Layer 0 enforces logging caps and healthchecks

The Layer 0 static check SHALL assert every service declares a logging cap
(max-size/max-file), and every long-running service declares a healthcheck,
failing CI on violation.

#### Scenario: Unbounded log config is rejected

- **WHEN** a service has no `logging` block with `max-size` and `max-file`
- **THEN** the Layer 0 static check SHALL fail

#### Scenario: Long-running service without healthcheck is rejected

- **WHEN** a long-running service (not a one-shot) has no healthcheck
- **THEN** the Layer 0 static check SHALL fail
