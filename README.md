<div align="center">

<img src="docs/assets/teaser.svg" alt="openSME — Self-hosted digital workplace" width="100%"/>

# openSME

**Self-hosted digital workplace for small &amp; medium enterprises.**

Docker Compose-based — from 5 to 500 users.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE.md)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![Traefik](https://img.shields.io/badge/Reverse_Proxy-Traefik_v3-24a7c0?logo=traefikproxy&logoColor=white)](https://traefik.io/)
[![Rust](https://img.shields.io/badge/Portal-Rust_Axum-ce422b?logo=rust&logoColor=white)](https://axum.rs/)

</div>

---

## What is openSME?

openSME is a complete, self-hosted productivity suite — file sync, mail,
groupware, identity management, and online office — behind a single Traefik
reverse proxy. You bring a server; Docker Compose does the rest.

No vendor lock-in. No per-seat cloud fees. Your data stays on your hardware.

| | |
|---|---|
| **IAM / SSO** | Keycloak + LDAP — OIDC, SAML, centralized auth |
| **Files** | OpenCloud — sync, share, collaborate |
| **Office** | Collabora — real-time document editing in the browser |
| **Mail** | Stalwart — modern Rust SMTP/IMAP server |
| **Groupware** | SOGo — webmail, calendar, contacts |
| **Database** | PostgreSQL 17 + PgBouncer connection pooling |
| **Cache** | Redis 7 + Memcached 1.6 |
| **Proxy** | Traefik v3 — automatic HTTPS via Let's Encrypt |
| **Portal** | Custom Rust/Axum landing page — service directory |

## Architecture

```mermaid
graph TB
    subgraph Internet ["🌐 Internet"]
        Client["Users"]
    end

    subgraph Proxy ["Reverse Proxy"]
        Traefik["Traefik v3<br/>:443 · Let's Encrypt"]
    end

    subgraph Core ["Core Services"]
        Portal["Portal<br/>(Rust / Axum :8080)"]
    end

    subgraph IAM ["Identity (optional overlay)"]
        Keycloak["Keycloak 26<br/>OIDC / SAML"]
        LDAP["OpenLDAP<br/>User directory"]
    end

    subgraph Files ["Files & Office (optional overlay)"]
        OpenCloud["OpenCloud<br/>File sync & share"]
        Collabora["Collabora<br/>Online office"]
    end

    subgraph Mail ["Mail & Groupware (optional overlay)"]
        Stalwart["Stalwart<br/>SMTP / IMAP"]
        SOGo["SOGo<br/>Webmail / Calendar"]
    end

    subgraph Data ["Data Layer"]
        Postgres[("PostgreSQL 17<br/>+ PgBouncer")]
        Redis[("Redis 7")]
        Memcached[("Memcached 1.6")]
    end

    Client -->|"HTTPS"| Traefik
    Traefik --> Portal
    Traefik --> Keycloak
    Traefik --> OpenCloud
    Traefik --> Collabora
    Traefik --> Stalwart
    Traefik --> SOGo

    Keycloak --> LDAP
    Keycloak --> Postgres
    OpenCloud --> Postgres
    OpenCloud --> Redis
    SOGo --> Postgres
    SOGo --> Memcached
    Stalwart --> Postgres

    style Traefik fill:#1f63d9,stroke:#2f7ff2,color:#fff
    style Portal fill:#0c1626,stroke:#2dd4bf,color:#e3ecff
    style Keycloak fill:#0c1626,stroke:#55a3fb,color:#e3ecff
    style LDAP fill:#0c1626,stroke:#55a3fb,color:#e3ecff
    style OpenCloud fill:#0c1626,stroke:#2dd4bf,color:#e3ecff
    style Collabora fill:#0c1626,stroke:#2dd4bf,color:#e3ecff
    style Stalwart fill:#0c1626,stroke:#55a3fb,color:#e3ecff
    style SOGo fill:#0c1626,stroke:#55a3fb,color:#e3ecff
    style Postgres fill:#1a4fae,stroke:#2f7ff2,color:#fff
    style Redis fill:#163d85,stroke:#55a3fb,color:#e3ecff
    style Memcached fill:#163d85,stroke:#55a3fb,color:#e3ecff
```

## Quick Start

### 1. Clone &amp; configure

```bash
git clone https://github.com/tobias-weiss-ai-xr/opensme-compose.git
cd opensme-compose
cp .env.example .env
# Edit .env — set your domains and passwords
```

### 2. Start core services

```bash
# Portal + Traefik + PostgreSQL + Redis + Memcached
docker compose up -d
```

### 3. Add features (overlays)

```bash
# Core + IAM + file sync + online office
export COMPOSE_FILE="docker-compose.yml:idm/keycloak.yml:opencloud/opencloud.yml"
docker compose up -d

# Full stack (add mail + groupware)
export COMPOSE_FILE="docker-compose.yml:idm/keycloak.yml:opencloud/opencloud.yml:mail/stalwart.yml:mail/sogo.yml"
docker compose up -d
```

### 4. Try the demo (minimal resources)

```bash
./scripts/demo.sh
# → Portal:    http://localhost:8080
# → Keycloak:  http://localhost:8081
# → OpenCloud: http://localhost:8082
```

Requires **2 vCPU / 4 GB RAM** — perfect for evaluation.

## Hardware Tiers

All tiers run the **same Compose stack** — scale vertically, no config changes.

| Tier | Users | vCPU | RAM | Storage | Reference |
|---|---|---|---|---|---|
| **Small** | 1–50 | 4–8 | 16–32 GB | 100–250 GB NVMe | Hetzner CX22 / CX32 |
| **Medium** | 50–500 | 12–16 | 48–64 GB | 500 GB–1 TB NVMe | Hetzner CX42 / CX62 |
| **Enterprise** | 500+ | Individual | | | Contact for sizing |

## Overlay System

Each feature is a separate Docker Compose file. Combine via `COMPOSE_FILE`:

| Overlay | Services | Domain | When to add |
|---|---|---|---|
| `docker-compose.yml` | Portal, Traefik, PostgreSQL, Redis, Memcached | `portal.*` | Always (core) |
| `idm/keycloak.yml` | Keycloak + OpenLDAP | `auth.*` | For SSO / IAM |
| `opencloud/opencloud.yml` | OpenCloud + Collabora | `cloud.*`, `collabora.*` | For file sync & office |
| `mail/stalwart.yml` | Stalwart Mail Server | `mail.*` | For email |
| `mail/sogo.yml` | SOGo Groupware | `webmail.*` | For webmail / calendar |
| `profiles/demo.dev.yml` | (overrides) | — | For demo / dev (low resources) |

## Configuration

All configuration via `.env`. See [`.env.example`](.env.example) for the full list.

| Variable | Default | Description |
|---|---|---|
| `OPENSME_DOMAIN` | `opensme.org` | Root domain for all services |
| `POSTGRES_PASSWORD` | `CHANGEME_*` | PostgreSQL superuser password |
| `KEYCLOAK_ADMIN_PASSWORD` | `CHANGEME_*` | Keycloak admin password |
| `OC_ADMIN_PASSWORD` | `CHANGEME_*` | OpenCloud admin password |
| `TRAEFIK_ACME_EMAIL` | `admin@...` | Let's Encrypt registration email |
| `TRAEFIK_USERS` | `admin:$$apr1$$...` | Traefik dashboard basic-auth (htpasswd) |
| `OPENSME_TIER` | `starter` | Resource profile: `starter` \| `business` \| `enterprise` |

> **⚠️ Change all `CHANGEME_*` passwords before production!**
> Use `openssl rand -base64 24` to generate secure values.

## Scripts

| Script | Description |
|---|---|
| `scripts/start.sh` | Start the stack (core + keycloak + opencloud) |
| `scripts/stop.sh` | Stop all services |
| `scripts/demo.sh` | Launch minimal demo with random passwords |
| `scripts/backup.sh` | Backup PostgreSQL + Traefik data |

## License

**Free for organizations with up to 50 users** (Small tier — AGPL v3).
Larger deployments require a commercial license.

| Tier | Users | License |
|---|---|---|
| **Small** | 1–50 | ✅ Free (AGPL v3) |
| **Medium** | 50–500 | 💰 Commercial |
| **Enterprise** | 500+ | 💰 Individual |

See [LICENSE.md](LICENSE.md) for full terms. Commercial licenses available at
[[REDACTED]](https://[REDACTED]) or [graphwiz.ai](https://graphwiz.ai).

## Credits

Built with:

- [Axum](https://github.com/tokio-rs/axum) — Rust web framework (Portal)
- [Traefik](https://traefik.io/) — Reverse proxy &amp; automatic TLS
- [Keycloak](https://www.keycloak.org/) — Identity &amp; access management
- [OpenCloud](https://opencloud.eu/) — File sync, share &amp; collaboration
- [Collabora](https://www.collaboraoffice.com/) — Online office editing
- [Stalwart](https://stalw.art/) — Modern mail server (Rust)
- [SOGo](https://www.sogo.nu/) — Groupware &amp; webmail
- [PostgreSQL](https://www.postgresql.org/) — Relational database

<div align="center">

**[Quick Start](#quick-start) · [Architecture](#architecture) · [Configuration](#configuration) · [License](#license)**

</div>
