# openSME 🏢

Self-hosted digital workplace for small and medium enterprises.
Docker Compose-based — from 5 to 500 users.

Built on [openSME](https://opensme.eu/) principles: IAM, file sync & share,
mail, groupware, and online office — all behind a single Traefik reverse proxy.

## Hardware Tiers

| Tier | Users | vCPU | RAM | Storage | Reference |
|---|---|---|---|---|---|---|
| **Small** | 1–50 | 4–8 | 16–32 GB | 100–250 GB NVMe | Hetzner CX22 / CX32 |
| **Medium** | 50–500 | 12–16 | 48–64 GB | 500 GB–1 TB NVMe | Hetzner CX42 / CX62 |
| **Enterprise** | 500+ | individuell | | | |

All tiers run the same Compose stack — scale vertically.

## Architecture

```
                    ┌───────── Traefik (:443) ─────────┐
                    │                                   │
              ┌─────┴─────┐              ┌──────────────┴──┐
              │  Portal    │              │  Keycloak/LDAP   │
              │ (Rust/Axum) │              │   (IAM/SSO)      │
              └─────┬─────┘              └────────┬─────────┘
                    │                             │
         ┌──────────┴──────────┐      ┌───────────┴──────────┐
         │    OpenCloud +      │      │   Stalwart + SOGo     │
         │    Collabora        │      │   (Mail + Groupware)  │
         └──────────┬──────────┘      └──────────┬────────────┘
                    │                             │
              ┌─────┴─────────── PostgreSQL ──────┴──── Redis ───┐
              │                                                 │
              └─────────────── Memcached ───────────────────────┘
```

## Quick Start

```bash
# 1. Config
cp .env.example .env
# Edit .env with your domains and passwords

# 2. Start core services
./scripts/start.sh

# 3. Add IAM + file sync
export COMPOSE_FILE="docker-compose.yml:idm/keycloak.yml:opencloud/opencloud.yml"
docker compose up -d
```

## Services

| Service | Domain | Overlay | Required |
|---|---|---|---|
| Portal | `portal.*` | Core | ✅ |
| Traefik | `traefik.*` | Core | ✅ |
| Keycloak + LDAP | `auth.*` | `idm/keycloak.yml` | recommended |
| OpenCloud | `cloud.*` | `opencloud/opencloud.yml` | optional |
| Collabora | `collabora.*` | `opencloud/opencloud.yml` | optional |
| Stalwart Mail | `mail.*` | `mail/stalwart.yml` | optional |
| SOGo Webmail | `webmail.*` | `mail/sogo.yml` | optional |

## Overlay System

Each feature is a separate Docker Compose file.
Combine them via `COMPOSE_FILE` env var:

```bash
# All services (500-user stack):
COMPOSE_FILE="docker-compose.yml:idm/keycloak.yml:opencloud/opencloud.yml:mail/stalwart.yml:mail/sogo.yml" \
  docker compose up -d
```

## Config

See `.env.example` for all options. Key variables:

| Variable | Default | Description |
|---|---|---|
| `OPENSME_DOMAIN` | `opensme.org` | Root domain |
| `POSTGRES_PASSWORD` | `CHANGEME_*` | DB password |
| `TRAEFIK_ACME_EMAIL` | `admin@...` | Let's Encrypt email |

## License

**Free for organizations with up to 50 users (Small tier — AGPL v3).**
Larger deployments require a commercial license from
[[REDACTED]](https://[REDACTED]) or
[graphwiz.ai](https://graphwiz.ai).

See [LICENSE.md](LICENSE.md) for full terms.

| Tier | Users | License |
|---|---|---|
| **Small** | 1–50 | ✅ Free (AGPL v3) |
| **Medium** | 50–500 | 💰 Commercial |
| **Enterprise** | 500+ | 💰 Individuell |

## Demo / Dev

```bash
./scripts/demo.sh
```

Starts Portal + Keycloak + OpenCloud on minimal resources.
Good for 2 vCPU / 4 GB RAM evaluation.

## Development

```bash
cd portal && cargo run
```

## Credits

Built with:
- [Axum](https://github.com/tokio-rs/axum) — Rust web framework
- [Traefik](https://traefik.io/) — Reverse proxy
- [Keycloak](https://www.keycloak.org/) — IAM/SSO
- [OpenCloud](https://opencloud.eu/) — File sync & share
- [Collabora](https://www.collaboraoffice.com/) — Online office
- [Stalwart](https://stalw.art/) — Mail server (Rust)
- [SOGo](https://www.sogo.nu/) — Groupware
