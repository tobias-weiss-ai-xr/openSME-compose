<!--
SPDX-FileCopyrightText: 2026 Tobias Weiss
SPDX-License-Identifier: Apache-2.0
-->

# E2E Journeys — Epics, User Stories & Tests

The user-facing truth of openSME is not the compose files — it is whether a
person can log in once and get their work done. Layer 5
([tests/05-e2e/](../tests/05-e2e/run.py)) verifies exactly those journeys
over real HTTP against a running stack: no mocks, no form scraping — logins
go through the Zitadel v2 Session API, the same API the hosted Login UI uses.

Every story below maps 1:1 to a check in the runner. Checks **skip** (not
fail) when the participating app isn't running, so the suite is meaningful
for any overlay subset.

---

## Epic A — Identity: one login for everything

> *Als Mitarbeiter möchte ich mich einmal anmelden und alle Apps nutzen
> können — ohne zweite Passwörter, ohne Second-Screen-Raterei.*

| # | User story | Journey test |
|---|------------|--------------|
| A1 | Als Betreiber sehe ich, dass der IdP seine OIDC-Metadaten korrekt veröffentlicht (endpoints, issuer, JWKS) | `section_discovery` — discovery document + JWKS keys |
| A2 | Als Mitarbeiter melde ich mich per Browser-Flow an (authorization-code + PKCE) und erhalte Tokens | `run_auth_code_flow` — real code exchange via v2 Session API |
| A3 | Als integrierende App vertraue ich dem ID-Token: RS256-Signatur gegen den live JWKS geprüft, iss/aud/exp/iat/nonce/sub stimmen | `verify_id_token` — pure-stdlib RSA verify, openssl-verified |
| A4 | Als Mitarbeiter lande ich in der zweiten App ohne erneute Passworteingabe | `section_sso_reuse` — second authorize finalized from the existing IdP session |
| A5 | Als Mitarbeiter beende ich meine Sitzung — und die tote Session wird überall abgewiesen | `section_logout` — DELETE session, then reject reuse |

**Security invariants covered by A2–A5:** state binding, PKCE S256,
audience binding, replay rejection after logout.

## Epic B — Portal: the single entry point

> *Als Mitarbeiter möchte ich einen Ort, der mir zeigt, was es gibt und ob
> es läuft — und der nichts verspricht, was nicht konfiguriert ist.*

| # | User story | Journey test |
|---|------------|--------------|
| B1 | Als Mitarbeiter öffne ich das Portal und sehe eine funktionierende Seite | `section_portal` — landing page 200, mentions openSME |
| B2 | Als Sicherheitsbeauftragter erwarte ich harte Browser-Header auf jeder Antwort (CSP, nosniff, frame-deny, referrer-policy) | header contract — mirrors the middleware in `portal/src/main.rs` |
| B3 | Als Mitarbeiter sehe ich, welche Dienste für mich freigeschaltet sind | `/api/services` returns the gated service list |
| B4 | Als Mitarbeiter lese ich Betreiber-Ankündigungen — wohlgeformt und ohne XSS-Risiko | `/api/announcements` schema contract (level ∈ info\|warn, non-empty text, ≤ 8) |
| B5 | Als Betreiber will ich, dass die AI-Karte (und ihr Endpoint) unsichtbar bleibt, solange keine KI konfiguriert ist | AI card gating — card visibility must match `AI_API_URL` |

## Epic C — Groupware & Chat: SSO reaches every app

> *Als Mitarbeiter möchte ich Mail, Webmail und Chat über denselben Login
> erreichen wie Dateien und Dokumente.*

| # | User story | Journey test |
|---|------------|--------------|
| C1 | Als Mitarbeiter erreiche ich OpenCloud, Notes, Paperless, Ticketing, Website und Store | `section_apps` — reachability (skips per app) |
| C2 | Als Chat-Nutzer beginnt der Matrix-Login beim zentralen IdP, nicht bei Synapse | `section_synapse_sso` — SSO redirect targets the IdP |
| C3 | Als Webmail-Nutzer lande ich beim zentralen IdP, nicht bei einer SOGo-Own-Login-Seite | `section_sogo_sso` — same contract for the groupware |

## Epic D — Local AI: there when configured, invisible when not

> *Als Mitarbeiter frage ich den lokalen Assistenten im Portal — als
> Betreiber stelle ich sicher, dass ohne `--profile ai` keine Spur davon
> sichtbar ist.*

| # | User story | Journey test |
|---|------------|--------------|
| D1 | (siehe B5) — UI/Endpoint gating | `section_portal` AI card gating |
| D2 | Als Mitarbeiter bekommt meine Frage eine Antwort über den Portal-Proxy (Retries überbrücken die Modell-Ladezeit) | Layer 4 `ai-proxy` round-trip — deployed twin of the portal's in-process contract tests |

---

## Running

```bash
# demo stack (bootstrap + full flows):
./scripts/demo.sh
python3 tests/run.py --e2e --domain opensme.local

# static-ish subset (no credentials needed):
python3 tests/05-e2e/run.py opensme.local --skip-flows

# CI runs the full suite against a fresh demo stack on every push to main.
```

Credentials: `ZITADEL_ADMIN_PASSWORD` from `.env`; the runner bootstraps a
throw-away OIDC app (`e2e-sso`) via the Management API and removes it
afterwards. See [tests/README.md](../tests/README.md#e2e-tests-05-e2e--sso--friends)
for all configuration knobs.
