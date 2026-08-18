<div align="center">

<img src="docs/assets/teaser.svg" alt="openSME — Self-hosted digital workplace" width="100%"/>

# openSME

**Self-hosted digital workplace for small &amp; medium enterprises.**

Docker Compose-based — from 5 to 500 users.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE.md)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![Traefik](https://img.shields.io/badge/Reverse_Proxy-Traefik_v3-24a7c0?logo=traefikproxy&logoColor=white)](https://traefik.io/)
[![Rust](https://img.shields.io/badge/Portal-Rust_Axum-ce422b?logo=rust&logoColor=white)](https://axum.rs/)

[Quick Start](#quick-start) · [Architecture](#architecture) · [Overlays](#overlay-system) · [Configuration](#configuration) · [License](#license)

</div>

---

## Why openSME?

| | Cloud Suite (Google / Microsoft) | Nextcloud | openSME |
|---|---|---|---|
| **Data sovereignty** | ❌ Data on vendor servers | ✅ Self-hosted | ✅ Self-hosted |
| **Per-seat pricing** | 💰 $6–$36/user/mo | Free (self-hosted) | Free ≤50 users |
| **Mail server included** | Via add-on | ❌ Plugin needed | ✅ Stalwart (Rust) |
| **Groupware (calendar/contacts)** | ✅ | ⚠️ Plugins | ✅ SOGo |
| **Online office editing** | ✅ | ⚠️ Via Collabora | ✅ Collabora built-in |
| **SSO / IAM** | ✅ | ❌ | ✅ Keycloak + LDAP |
| **Single Docker Compose stack** | N/A | ❌ Manual | ✅ One `docker compose up` |
| **AGPL — no vendor lock-in** | N/A | ✅ | ✅ |

For 50 users on Google Workspace: **$300–$1,800/month**.
With openSME on a Hetzner CX22 (~€15/mo): **€15/month total.**
That's a **95–99% cost reduction** while keeping full data sovereignty.

### Who is this for?

- **Small businesses** (5–50 users) who want Google Workspace functionality
  without per-seat fees or data leaving their control
- **Schools &amp; municipalities** required by law to keep data on-premises
- **Privacy-conscious teams** who need mail, files, calendar, and office in one stack
- **MSPs / IT consultants** deploying productivity suites for clients

## What's inside?

| | |
|---|---|
| **IAM / SSO** | Keycloak 26 + OpenLDAP — OIDC, SAML, centralized auth |
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

## Prerequisites

| Requirement | Minimum | Recommended |
|---|---|---|
| **OS** | Linux (Docker required) | Ubuntu 22.04+ / Debian 12+ |
| **Docker** | 24.0+ | 25.0+ |
| **Docker Compose** | v2.20+ | v2.29+ |
| **RAM** | 4 GB (demo) | 16 GB (Small) — 64 GB (Medium) |
| **CPU** | 2 vCPU (demo) | 4–16 vCPU |
| **Disk** | 20 GB SSD | 100 GB–1 TB NVMe |
| **Domain** | One A record | Wildcard or per-service A records |
| **Ports** | 80, 443 open | — |

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

## Project Structure

```
opensme-compose/
├── docker-compose.yml          # Core: Traefik, PostgreSQL, Redis, Memcached, Portal
├── .env.example                # All configuration variables
├── idm/
│   └── keycloak.yml            # Overlay: Keycloak + OpenLDAP (IAM/SSO)
├── opencloud/
│   └── opencloud.yml           # Overlay: OpenCloud + Collabora (files & office)
├── mail/
│   ├── stalwart.yml            # Overlay: Stalwart mail server
│   └── sogo.yml                # Overlay: SOGo groupware (webmail/calendar)
├── profiles/
│   └── demo.dev.yml            # Profile: minimal resources for demo/dev
├── portal/                     # Rust/Axum portal (service directory)
│   ├── Cargo.toml
│   ├── Dockerfile              # Multi-stage build with cargo-chef
│   └── src/main.rs
├── scripts/
│   ├── start.sh                # Start stack (core + keycloak + opencloud)
│   ├── stop.sh                 # Stop all services
│   ├── demo.sh                 # One-command demo with random passwords
│   └── backup.sh               # Backup PostgreSQL + Traefik data
├── traefik/
│   └── traefik.yml             # Traefik static configuration reference
└── docs/
    └── assets/
        └── teaser.svg          # README banner image
```

## Development

The Portal is a Rust application using [Axum](https://axum.rs/):

```bash
cd portal
cargo run
# → Portal listening on 0.0.0.0:8080
```

Environment variables for local development:

| Variable | Default | Purpose |
|---|---|---|
| `PORTAL_DOMAIN` | `portal.opensme.org` | Portal hostname |
| `OPENSME_DOMAIN` | `opensme.org` | Root domain |
| `OPENCLOUD_URL` | `https://cloud.opensme.org` | OpenCloud link |
| `MAIL_URL` | `https://webmail.opensme.org` | Webmail link |
| `KEYCLOAK_URL` | `https://auth.opensme.org` | Keycloak link |
| `COLLABORA_URL` | `https://collabora.opensme.org` | Collabora link |

## Troubleshooting

<details>
<summary><b>Port 80/443 already in use</b></summary>

Traefik binds `:80` and `:443`. Stop conflicting services:

```bash
sudo lsof -i :80 -i :443
# Or on systemd hosts: sudo systemctl stop nginx caddy
```

For local development, map services to different ports in `.env`.
</details>

<details>
<summary><b>Let's Encrypt rate limits</b></summary>

Traefik uses Let's Encrypt's HTTP-01 challenge. If you hit rate limits:

1. Set `TRAEFIK_ACME_ENABLED=false` in `.env` during testing
2. Use the `demo.sh` script (no TLS needed)
3. Wait 1 hour for the rate limit window to reset

Production: ensure `TRAEFIK_ACME_EMAIL` is set and DNS A records point to your server.
</details>

<details>
<summary><b>PostgreSQL won't start</b></summary>

```bash
# Check logs
docker compose logs postgres

# Common fix: remove stale data volume (⚠️ data loss!)
docker compose down -v
```

If `POSTGRES_PASSWORD` was changed after first start, the existing volume
keeps the old password. Remove the volume or update the password inside psql.
</details>

<details>
<summary><b>Keycloak returns 502 / startup timeout</b></summary>

Keycloak needs 60+ seconds on first start (realm import). Check:

```bash
docker compose logs -f keycloak
# Wait for "Keycloak started in X seconds"
```

If PgBouncer isn't running, Keycloak can't reach PostgreSQL. Verify:
```bash
docker compose ps pgbouncer
```
</details>

<details>
<summary><b>OpenCloud can't connect to Keycloak</b></summary>

Verify that `OC_OIDC_ISSUER` matches your Keycloak realm URL. The default
realm is `opensme`. Check Keycloak's realm settings at
`https://auth.your-domain/auth/admin/`.
</details>

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

## Backup &amp; Restore

### Backup

```bash
./scripts/backup.sh
# → ./backups/postgres_20260818_120000.sql.gz
# → ./backups/traefik_20260818_120000.tar.gz
```

For automated daily backups, add a cron entry:

```bash
0 3 * * * cd /opt/opensme && ./scripts/backup.sh >> /var/log/opensme-backup.log 2>&1
```

### Restore

```bash
# Restore PostgreSQL
gunzip -c ./backups/postgres_20260818_120000.sql.gz | docker compose exec -T postgres psql -U opensme

# Restore Traefik data
docker compose run --rm -v "$(pwd)/backups:/backups" alpine \
  tar xzf /backups/traefik_20260818_120000.tar.gz -C /var/lib/docker/volumes
```

## DNS Setup

Each service needs an A record pointing to your server. For a single-IP deployment:

```
opensme.org.          IN A   <your-server-ip>
portal.opensme.org.   IN A   <your-server-ip>
auth.opensme.org.     IN A   <your-server-ip>
cloud.opensme.org.    IN A   <your-server-ip>
collabora.opensme.org. IN A  <your-server-ip>
webmail.opensme.org.  IN A   <your-server-ip>
mail.opensme.org.     IN A   <your-server-ip>
```

Or use a wildcard: `*.opensme.org. IN A <your-server-ip>`.

## Security

<details>
<summary><b>Production checklist</b></summary>

1. **Change all `CHANGEME_*` passwords** in `.env` — use `openssl rand -base64 24`
2. **Set `TRAEFIK_ACME_ENABLED=true`** for automatic HTTPS via Let's Encrypt
3. **Set a strong `TRAEFIK_USERS`** htpasswd: `htpasswd -nb admin 'YOUR_PASSWORD'`
4. **Close unnecessary ports** — only 80, 443 should be public. PostgreSQL (5432),
   Redis (6379), etc. must be on `opensme-net` only, never published.
5. **Enable firewall** (UFW or equivalent):
   ```bash
   sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw enable
   ```
6. **Set up automated backups** (see above) and test restores regularly
7. **Monitor resource usage** — set up alerts for disk space and memory
8. **Keep images updated** — periodically `docker compose pull && docker compose up -d`

</details>

<details>
<summary><b>OIDC / SAML configuration</b></summary>

Keycloak is pre-configured with a `opensme` realm. To add client applications:

1. Navigate to `https://auth.your-domain/auth/admin/`
2. Log in with `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD`
3. Create a client under the `opensme` realm
4. Set the redirect URI to your application's callback URL

OpenCloud is pre-configured as an OIDC client (`OC_OIDC_CLIENT_ID=opencloud`).
To add custom apps, follow the [Keycloak OIDC guide](https://www.keycloak.org/docs/latest/securing_apps/).

</details>

## Upgrading

```bash
# Pull latest images
docker compose pull

# Apply updates with zero downtime (rolling restart)
docker compose up -d

# If database schema migration is needed:
docker compose exec postgres psql -U opensme -c '\dt'
```

### Version pins

Images are pinned to major versions for stability:

| Component | Image | Version |
|---|---|---|
| PostgreSQL | `postgres:17-alpine` | 17.x |
| Redis | `redis:7-alpine` | 7.x |
| Keycloak | `quay.io/keycloak/keycloak:26.1` | 26.1.x |
| OpenCloud | `opencloudeu/opencloud-rolling:6.0.0` | 6.0.x |
| Collabora | `collabora/code:24.04` | 24.04.x |
| Traefik | `traefik:v3.3` | 3.3.x |

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
