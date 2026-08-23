## Purpose

Defines runtime performance tuning across the stack: shared-memory sizing
(`shm_size`), per-tier Postgres/Redis/Memcached/PgBouncer parameters, and a
Traefik healthcheck plus compression middleware — applied per tier so small
budgets are not wasted and medium tiers get throughput.

## ADDED Requirements

### Requirement: Shared memory is sized for real consumers

Services that use `/dev/shm` (postgres, opencloud, collabora, tika) SHALL
declare a `shm_size` proportional to their tier (> 64 MB default where
workload needs it).

#### Scenario: Postgres has adequate shm

- **WHEN** the small or medium tier runs
- **THEN** `opensme-postgres` SHALL declare `shm_size` ≥ 256 MB

#### Scenario: Collabora does not starve shm

- **WHEN** the medium tier runs Collabora
- **THEN** it SHALL declare a `shm_size` at least 256 MB

### Requirement: Postgres runtime parameters are tier-appropriate

Postgres SHALL set checkpoint/bgwriter/autovacuum parameters per tier
(beyond the existing shared_buffers/work_mem): `checkpoint_completion_target`,
`max_wal_size` margins, `bgwriter_lru_maxpages`, and autovacuum work_mem,
so large allocations do not stall checkpoints on small hosts.

#### Scenario: Small tier avoids checkpoint stalls

- **WHEN** the small profile is applied
- **THEN** checkpoint_completion_target and bgwriter settings SHALL be present
  and consistent with the small memory budget

#### Scenario: Medium tier keeps vacuum fast

- **WHEN** the medium profile is applied
- **THEN** autovacuum_work_mem and maintenance_work_mem SHALL be scaled to the
  medium budget

### Requirement: Cache layers are tuned per tier

Redis SHALL enable lazy freeing (`lazyfree-lazy-eviction yes`) and use
`allkeys-lru` with a tier-appropriate `maxmemory`; Memcached SHALL set
threads, connection and slab sizes per tier.

#### Scenario: Redis lazy freeing is enabled

- **WHEN** the redis service config is rendered
- **THEN** `lazyfree-lazy-eviction` SHALL be enabled
- **AND** `maxmemory-policy` SHALL be `allkeys-lru`

#### Scenario: Memcached matches tier

- **WHEN** a tier profile is applied
- **THEN** memcached `-m` and `-t` SHALL match the tier's declared memory/CPU

### Requirement: PgBouncer pools scale with tier

PgBouncer pool sizes SHALL be proportional to the tier's `max_connections`
(default_pool_size and max_client_conn scaled per tier).

#### Scenario: Medium pool exceeds small pool

- **WHEN** medium and small profiles are rendered
- **THEN** medium PgBouncer default_pool_size and max_client_conn SHALL be
  greater than small's

#### Scenario: Pool never exceeds Postgres connections

- **WHEN** any tier renders
- **THEN** PgBouncer max_client_conn SHALL not exceed the tier's
  `max_connections`

### Requirement: Traefik has a healthcheck and compression

The Traefik service SHALL declare a healthcheck, and the web/secure entry
points SHALL enable gzip/brotli compression middleware so small payloads and
HTML/JS assets transfer faster.

#### Scenario: Traefik healthcheck present

- **WHEN** the traefik service is rendered
- **THEN** a healthcheck against its ping/api endpoint SHALL be declared

#### Scenario: Compression enabled on entrypoints

- **WHEN** the traefik config is rendered
- **THEN** a compress middleware SHALL be attached to websecure
