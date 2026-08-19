# openSME Compose — Deployment Comparison & Merge Plan

## Overview

Two deployments of openSME exist:

| Feature | [REDACTED] (master) | [REDACTED] (Zendis) |
|---------|--------------------------------------|-------------------|
| **IAM** | Zitadel (Go, 512 MB) | Casdoor (Go, 128 MB) |
| **Architecture** | Overlay-based (`COMPOSE_FILE=a:b:c`) | Profile-based (`--profile office`) |
| **Networks** | Single `opensme-net` | Separate `traefik-frontend` + `backend` |
| **Services** | 6 core (Traefik, PG, PgBouncer, Redis, Memcached, Portal) + Zitadel, OpenCloud, Collabora, Stalwart, SOGo | 9 core (Traefik, PG, Casdoor, Redis, Stalwart, SOGo, Invoice Ninja, Paperless, Gotenberg) + optional profiles |
| **Profiles** | `demo.dev`, `demo.live`, `demo.coexist`, `system-traefik` | `office`, `chat`, `collab`, `element`, `notes`, `tika`, `memcached` |
| **Tiers** | None (single config) | `soho` (4c/8G), `small` (8c/24G), `medium` (16c/48G) |
| **Testing** | None | Makefile with 7-layer test pyramid |
| **Backup** | PostgreSQL dump + Traefik ACME | Volume-level backup/restore with dry-run |
| **Images** | Public (ghcr.io, Docker Hub) | Zendis (registry.opencode.de, requires auth) |
| **Portal** | Custom Rust/Axum portal | None (services accessed directly) |
| **Monitoring** | dev-agent, predictive-agent, ollama, taskfleet | None |
| **PostgreSQL** | 17-alpine, production tuning, PgBouncer | 15.13-alpine, SOHO tuning, per-service DBs/users |
| **Redis** | 7-alpine, AOF + RDB persistence | 7.4.3, no persistence (volatile cache) |
| **Mail** | Stalwart v0.16 with entrypoint template | Stalwart latest, static config |
| **Groupware** | SOGo with LDAP | SOGo with Casdoor OIDC |
| **File sync** | OpenCloud + Collabora + MinIO (S3) | OpenCloud (optional profile, local storage) |
| **Extra services** | None | Invoice Ninja, Paperless-ngx, Gotenberg, CryptPad, Synapse, Element-Web, Notes/Impress |
| **DB init** | 2 databases (zitadel, sogo) via SQL | 7 databases with separate users via shell script |
| **Coexist** | `demo.coexist.yml` (piggyback on existing Traefik) | `docker-compose.test.yml` (port remapping) |

## What to Take from [REDACTED]

### 1. Profile-Based Architecture
[REDACTED] uses `--profile` flags (e.g., `--profile office`) instead of `COMPOSE_FILE` overlays. This is cleaner — services stay in one `docker-compose.yml`, profiles enable/disable them. Our overlay approach requires remembering file order.

**Decision**: Adopt profiles as an **alternative** to overlays. Keep overlays for backward compatibility but add profile support.

### 2. Makefile with Test Pyramid
[REDACTED] has a comprehensive Makefile with:
- Layer 0: Static validation (shellcheck, yamllint, compose config, env check, secret scan)
- Layer 1: Host tuning (Ansible dry-run)
- Layer 2: Container health
- Layer 3: Smoke tests (HTTP/SSL/port)
- Layer 4: Integration tests (OIDC, email, API)
- Layer 5: E2E (Playwright)
- Layer 6: Security audit

**Decision**: Adopt the Makefile with test pyramid. Adapt for our service names and IAM (Zitadel instead of Casdoor).

### 3. Tier-Based Resource Profiles
[REDACTED] has `soho` (4c/8G), `small` (8c/24G), `medium` (16c/48G) tiers that auto-select profiles and set resource limits.

**Decision**: Adopt tier system. Our `demo.dev` and `demo.live` are similar but less structured.

### 4. Additional Services
[REDACTED] has services we lack:
- **Invoice Ninja** — invoicing for SMEs
- **Paperless-ngx** — document management with OCR
- **Gotenberg** — PDF conversion API (companion to Paperless)
- **CryptPad** — collaborative document editing (lighter than Collabora)
- **Synapse** — Matrix chat server
- **Element-Web** — Matrix web client
- **Notes/Impress** — collaborative note-taking with MinIO S3

**Decision**: Add these as optional profiles. They're valuable for a complete SME platform.

### 5. Separate Networks
[REDACTED] uses `traefik-frontend` (public) + `backend` (internal). Only Traefik and labeled services are on `traefik-frontend`. Our single `opensme-net` means all services can be exposed.

**Decision**: Adopt two-network model. More secure.

### 6. Volume-Level Backup/Restore
[REDACTED]'s `backup.sh` stops services, backs up each volume individually, combines into a single tar.gz, and has `--dry-run` and `--services` options. Our backup only dumps PostgreSQL + Traefik ACME.

**Decision**: Adopt volume-level backup with dry-run support. Keep PostgreSQL dump as well.

### 7. Per-Service Database Users
[REDACTED] creates separate PostgreSQL users for each service (casdoor_user, synapse_user, opencloud_user, etc.) with their own passwords. Our init creates only `zitadel` and `sogo` databases.

**Decision**: Adopt per-service database users for better isolation.

### 8. Casdoor as Lightweight IAM Option
Casdoor is 128 MB vs Zitadel's 512 MB. For small deployments, Casdoor may be preferable.

**Decision**: Keep Zitadel as default, add Casdoor as an alternative `idm/casdoor.yml` overlay for lightweight deployments.

## What to Keep from [REDACTED] (master)

### 1. Zitadel as Primary IAM
Zitadel has better enterprise features (machine keys, service accounts, OIDC flows). Keep as default.

### 2. PgBouncer
Connection pooling is essential for high-load PostgreSQL. Keep.

### 3. OpenCloud with S3/MinIO
Decomposeds3 storage is more scalable than local storage. Keep.

### 4. Collabora
Full office editing is more powerful than CryptPad alone. Keep.

### 5. Monitoring Overlays
AI-powered health monitoring is unique to our deployment. Keep.

### 6. Coexist Profile
Piggybacking on existing Traefik is essential for shared hosts. Keep.

### 7. Rust Portal
Custom portal provides a landing page. Keep.

### 8. Stoic Unix Philosophy
Each file does one thing well. Keep the modular structure.

### 9. Comprehensive README and .env.example
Our documentation is more thorough. Keep.

### 10. demo.dev and demo.live Profiles
Separate dev and live configs. Keep.

### 11. Stalwart with Entrypoint Template
Config rendering from template is more flexible than static config. Keep.

### 12. SOGo with LDAP
LDAP integration for user management. Keep.

### 13. Production PostgreSQL Tuning
Our tuning (shared_buffers=1GB, etc.) is more production-ready. Keep.

### 14. Redis with Persistence
AOF + RDB is safer than volatile cache. Keep.

### 15. Health Checks on All Services
Every service has a healthcheck. Keep.

## Merged Architecture

The merged deployment will have:

```
docker-compose.yml          # Core: Traefik, PG, PgBouncer, Redis, Memcached, Portal
idm/zitadel.yml             # Zitadel (default IAM)
idm/casdoor.yml             # Casdoor (lightweight IAM alternative)
opencloud/opencloud.yml     # OpenCloud + Collabora + MinIO (profile: office)
mail/stalwart.yml           # Stalwart mail
mail/sogo.yml               # SOGo groupware
profiles/                   # Resource profiles
  demo.dev.yml              # Dev (minimal)
  demo.live.yml             # Live demo (Let's Encrypt)
  demo.coexist.yml          # Coexist with existing Traefik
  system-traefik.yml        # System Traefik
  soho.yml                  # SOHO tier (4c/8G)
  small.yml                 # Small tier (8c/24G)
  medium.yml                # Medium tier (16c/48G)
services/                   # Optional service profiles
  invoice-ninja.yml         # Invoicing (profile: invoice)
  paperless.yml             # Document management (profile: paperless)
  cryptpad.yml              # Collaborative docs (profile: collab)
  synapse.yml               # Matrix chat (profile: chat)
  element.yml               # Matrix web client (profile: element)
  notes.yml                 # Notes/Impress (profile: notes)
monitoring/                 # AI monitoring overlays
  dev-agent.yml
  predictive-agent.yml
  ollama.yml
  taskfleet.yml
scripts/                    # Operations
  start.sh
  stop.sh
  demo.sh
  demo-live.sh
  backup.sh                 # Enhanced: PG dump + volume backup
  restore.sh                # Volume restore
  synapse-setup.sh          # Synapse config generator
Makefile                    # Test pyramid + tier-based deployment
postgres-init/              # Per-service database init
  00-create-databases.sql   # Zitadel + SOGo
  01-create-extra-dbs.sql   # Optional: Casdoor, Synapse, Paperless, Invoice Ninja
```

### Service Tiers

| Tier | Profiles | RAM | Users |
|------|----------|-----|-------|
| `soho` | core only | ~4 GB | 1-5 |
| `small` | core + office + paperless | ~8 GB | 10-25 |
| `medium` | core + office + paperless + chat + collab + element | ~16 GB | 40-60 |

### Network Model

```
traefik-frontend (public):
  - traefik
  - portal (labeled)
  - zitadel/casdoor (labeled)
  - opencloud (labeled)
  - sogo (labeled)
  - stalwart (labeled)
  - paperless (labeled)
  - invoices (labeled)

backend (internal):
  - postgres
  - pgbouncer
  - redis
  - memcached
  - minio
  - collabora (no Traefik labels)
  - gotenberg (no Traefik labels)
```
