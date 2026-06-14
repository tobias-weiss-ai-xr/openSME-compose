# openSME 🏢

Self-hosted digital workplace for small and medium enterprises.
Docker Compose-based — from 5 to 500 users.

Built on [openSME](https://opensme.eu/) principles: IAM, file sync & share,
mail, groupware, and online office — all behind a single Traefik reverse proxy.

## Hardware Tiers

| Tier | Users | vCPU | RAM | Storage | Reference |
|---|---|---|---|---|---|
| **Micro** | 5–10 | 4 | 16 GB | 100 GB NVMe | Hetzner CX22 |
| **Small** | 10–50 | 8 | 32 GB | 250 GB NVMe | Hetzner CX32 |
| **Medium** | 50–150 | 12 | 48 GB | 500 GB NVMe | Hetzner CX42 |
| **Large** | 150–500 | 16+ | 64 GB | 1 TB NVMe | Hetzner CX62 / 2-node |

All tiers run the exact same Compose stack — scale vertically by beefing up the
single node. At 500+ users you split mail (Stalwart) onto a second node.

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
| `OPENSME_DOMAIN` | `opensme.example.com` | Root domain |
| `POSTGRES_PASSWORD` | `CHANGEME_*` | DB password |
| `TRAEFIK_ACME_EMAIL` | `admin@...` | Let's Encrypt email |

## License

**Free for organizations with up to 50 users (Micro + Small tier).**
Larger deployments require a commercial license from
[[REDACTED]](https://[REDACTED]) or
[graphwiz.ai](https://graphwiz.ai).

See [LICENSE.md](LICENSE.md) for full terms.

| Tier | Users | License |
|---|---|---|
| Micro | 5–10 | ✅ Free |
| Small | 10–50 | ✅ Free |
| Medium | 50–150 | 💰 Commercial |
| Large | 150–500 | 💰 Commercial |

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
