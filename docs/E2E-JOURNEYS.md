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

## Epic E — Trust & transport: every response is defensible

> *Als Nutzer und als Auditor vertraue ich dem Portal auch dann, wenn ich
> auf eine falsche URL klicke oder bewusst HTTP eintippe.*

| # | User story | Journey test |
|---|------------|--------------|
| E1 | Als Nutzer, der `http://` eintippt, lande ich sofort verschlüsselt | plain-HTTP request → redirect to HTTPS |
| E2 | Als Auditor erwarte ich die harten Header auf JEDER Antwort — auch auf 404 | security headers survive a 404 response |

## Epic F — Truthful catalog: the portal never lies

> *Als Mitarbeiter klicke ich auf eine Kachel und erwarte, dass dahinter
> wirklich ein Dienst steht — keine Leichen im Katalog.*

| # | User story | Journey test |
|---|------------|--------------|
| F1 | Als Mitarbeiter kann ich jeder beworbenen Kachel trauen: advertised ⇔ reachable | every `/api/services` entry answers with < 500 |

## Epic G — Identity lifecycle: identities are born, work, and die

> *Als Betreiber lege ich einen Mitarbeiter über die API an; er meldet
> sich an; nach Kündigung ist die Identität sofort tot — überall.*

| # | User story | Journey test |
|---|------------|--------------|
| G1 | Als Betreiber provisions ich eine Identität per IdP-API (inkl. Initialpasswort) | `section_user_lifecycle` — create-with-password |
| G2 | Als frisch angelegter Mitarbeiter melde ich mich über den kompletten SSO-Flow an | full authorization-code flow as the new user |
| G3 | Als Betreiber lösche ich die Identität — und der tote Login wird abgewiesen, solange die App existiert | deletion → login attempt → rejection |

The journey is idempotent: leftovers from crashed runs are purged before
provisioning, and the identity is cleaned up even on failure.

## Epic H — Broadcast: the operator talks to every user at once

> *Als Betreiber verkünde ich eine Ankündigung an alle Nutzer — und ein
> Angreifer kann über diesen Kanal kein JavaScript einschleusen.*

| # | User story | Journey test |
|---|------------|--------------|
| H1 | Als Nutzer sehe ich die Betreiber-Ankündigung auf der Landing Page | `tests/05-e2e/broadcast.py` — env-driven publish, portal recreate |
| H2 | Als Angreifer erreiche ich über den Announcements-Kanal keine Skript-Ausführung | `<script>` payload arrives HTML-escaped on page and API |
| H3 | Als Nutzer erlebe ich Stille, wenn nichts zu sagen ist | withdraw → zero announcements |

Unlike the read-only journeys, Epic H **recreates the portal container**
with a `PORTAL_ANNOUNCEMENTS` override and restores it afterwards — the
only journey that drives the stack's lifecycle, because that is exactly
what an operator broadcast does.

## Epic I — Files & collaboration: the cloud is walled

> *Als Nutzer lege ich Dateien in der Cloud ab — und als Auditor stelle
> ich fest, dass niemand ohne Login an sie herankommt.*

| # | User story | Journey test |
|---|------------|--------------|
| I1 | Als Nutzer lädt die Cloud-Weboberfläche | `section_opencloud` — UI 200 with product marker |
| I2 | Als Angreifer komme ich ohne Credentials nicht an Dateien | unauthenticated WebDAV → 401/403 (auth wall holds) |
| I3 | Als Betreiber sehe ich ehrlich, ob Cloud-Login ans IdP angebunden ist | OIDC wiring probe — **warn** when the client isn't registered (the demo subset currently ships without it — web UI loads, login would fail; register the `opencloud` app for the full demo) |

## Epic J — Resilience: the stack heals itself

> *Als Betreiber übersteht mein Stack einen DB-Neustart und einen
> IdP-Ausfall, ohne dass Nutzer etwas davon merken.*

| # | User story | Journey test |
|---|------------|--------------|
| J1 | Als Nutzer merke ich nichts, wenn die Datenbank bounced | `tests/05-e2e/resilience.py` — `restart postgres` → IdP, portal reconnect and get healthy |
| J2 | Als Nutzer arbeite ich weiter, wenn der IdP ausfällt | `stop zitadel` → portal + cloud STAY up (degradation, not outage) → `start zitadel` → discovery serves again |

This is the second lifecycle-driving journey — it bounces real containers
and restores the stack in `finally`, so a crash can't leave it broken.

## Epic K — Backup & recovery: provable restore points

> *Als Betreiber kann ich nachweisen, dass mein Backup ein echter
> Restore-Punkt ist — kein Placebo.*

| # | User story | Journey test |
|---|------------|--------------|
| K1 | Als Betreiber erzeugt `scripts/backup.sh` nicht-leere, gültige Artefakte | `tests/05-e2e/backup.py` — runs the operator's own tooling, audits output |
| K2 | Der SQL-Dump enthält echte Tabellen — inklusive der IdP-Datenbank | gzip'd dump: size, `CREATE TABLE` count, zitadel db present |
| K3 | Das Traefik-Archiv (ACME/TLS-Material) ist ein gültiges tar | tar listing non-empty; full gzip CRC verified |

This journey caught a real bug: `backup.sh` used `compose run` (a second,
serverless container) for the SQL dump — it silently produced **empty**
dumps, and its default mode downed the stack *before* dumping. Both are
fixed; the journey keeps them fixed.

## Epic L — Session isolation: coworkers don't share keys

> *Als zwei Mitarbeiter angemeldet sind, darf das Abmelden des einen den
> anderen nie rauswerfen.*

| # | User story | Journey test |
|---|------------|--------------|
| L1 | Als Mitarbeiterin habe ich meine EIGENE IdP-Sitzung | `section_session_isolation` — two provisioned coworkers, distinct session ids |
| L2 | Als Mitarbeiter bleibt meine Sitzung bestehen, wenn ein Kollege sich abmeldet | A's logout sticks AND B's session still finalizes auth requests |

## Epic M — Exposure: management planes stay closed

> *Als Betreiber ist die Angriffsfläche dokumentiert — und nichts
> Statefulliches oder Verwaltbares hängt am Host.*

| # | User story | Journey test |
|---|------------|--------------|
| M1 | Der Host exponiert nur die dokumentierten Ports | `tests/05-e2e/exposure.py` — published ports == {80, 443, 8080} |
| M2 | Als Angreifer erreiche ich postgres/redis/memcached nicht vom Host | no host bindings + live port probes refuse |
| M3 | Traefiks Verwaltungs-API ist nicht öffentlich geroutet | `/api/http/routers`, `/dashboard/`, `/api/overview` → not 200 on any public host |

## Epic N — Runtime truth: what runs is what's declared

> *Als Betreiber kann ich beweisen, dass der Stack genau die Bits
> fährt, die deklariert sind — und keine `:latest`-Lotterie.*

| # | User story | Journey test |
|---|------------|--------------|
| N1 | Das Laufende entspricht der Deklaration — kein Drift | `tests/05-e2e/runtime_truth.py` — `compose config` vs. running images (build services are their own truth) |
| N2 | Kein Container läuft auf einem veränderlichen `:latest`-Tag | every running image is version-pinned |

This journey forced real pinning fixes: traefik `:latest` → `v3.7.13`,
zitadel → `v4.19.4`, opencloud → `8.0.1` — exactly what was running, now
immune to silent upstream upgrades.

## Epic O — Local AI, for real: the flagship path, live

> *Als Nutzer stelle ich dem Portal eine Frage und bekomme eine Antwort
> vom lokalen KI-Backend — mit sauberem Vertrag und abgesicherten
> Eingaben.*

| # | User story | Journey test |
|---|------------|--------------|
| O1 | Mit konfigurierter KI WIRD die Karte sichtbar (Umkehrung von D2/B5) | `tests/05-e2e/ai_journey.py` — portal recreated with `AI_API_URL` → `id="ai-card"` present |
| O2 | Frage rein, Antwort raus — der Proxy-Roundtrip funktioniert | POST `/api/ai/chat` → answer from the OpenAI-compatible mock |
| O3 | Das Portal spricht den korrekten Upstream-Vertrag | mock logs prove: bearer auth, `model` from `AI_MODEL`, user message == question, `max_tokens` bounded |
| O4 | Leere Fragen werden abgewiesen, nicht weitergeleitet | empty question → 400 AND nothing reaches the backend |
| O5 | Nach dem Test ist der Stack wieder im Auslieferungszustand | teardown: card hidden again |

The backend is a pure-stdlib mock (`tests/05-e2e/ai_mock.py`) that the
portal reaches over the docker bridge gateway — the journey tests the
PORTAL's AI surface and its contract, not a real LLM.

## Epic P — Mail, for real: mailcow delivers actual mail

> *Als Betreiber will ich die volle Mail-Server-Option (mailcow-dockerized,
> als Git-Submodule gepinnt) wie ein Nutzer UND wie ein Auditor fahren:
> echtes SMTP/IMAP, echte Zustellung, abgeschottete Verwaltung.*

| # | User story | Journey test |
|---|------------|--------------|
| P1 | Die Admin-UI lädt über den openSME-Traefik | `tests/05-e2e/mailcow_journey.py` — `https://mail.<domain>/` serves the mailcow UI |
| P2 | SMTP kündigt sich sauber an :25 an | EHLO → 250 with the mailcow banner |
| P3 | Submission auf :587 verhandelt STARTTLS | smtplib STARTTLS handshake succeeds |
| P4 | IMAPS auf :993 verhandelt TLS | stdlib TLS handshake succeeds |
| P5 | **Zustell-Roundtrip**: Mailbox rein, Post an sich selbst, INBOX raus | REST API provisions domain+mailbox (deterministic password via `edit/mailbox`) → authenticated SMTP submission → message found in INBOX over IMAPS — pure stdlib (`smtplib`/`imaplib`) |
| P6 | SOGo-Webmail antwortet | `/SOGo/` reachable through the same edge |
| P7 | Die REST-API wird NIEMALS an der Öffentlichkeit serviert | `/api/v1/...` via Traefik → 401/403/404 (the allowlist covers localhost only) |

Integration facts (deliberately honest):

- **Submodule, kein Fork**: `mail/mailcow-dockerized` ist auf ein
  Upstream-Release gepinnt (`git submodule status` zeigt den Commit, Tag
  `2026-09` zum Zeitpunkt der Integration). GPL-3.0 bleibt in seinem
  eigenen Baum — kein Code wird in dieses Apache-2.0-Repo kopiert.
- **`scripts/mailcow.sh` ist der einzige Entrypoint**: rendert
  `mail/mailcow.conf` (gitignored, Secrets) aus `.env`, bootet das
  mailcow-Compose-Projekt, hängt Traefik ans mailcow-Netz und verwaltet
  den dynamischen Router als Marker-Block in `traefik/dynamic.yml`.
- **TLS gehört Traefik**: mailcows eigener ACME/HTTP-Weg ist aus, die
  Weboberfläche ist nur über die OpenSME-Edge erreichbar. Ein
  self-signed-Zertifikat (plus DH-Params) wird vom Wrapper in
  `data/assets/ssl` gelegt, damit die internen Listener (nginx/dovecot)
  starten.
- **IPv6**: mailcow bindet dual-stack. Auf Hosts, die mit
  `ipv6.disable=1` booten, patcht der Wrapper die offiziellen
  user-editable-Konfigpunkte (`data/conf/*`, update-fest) auf IPv4 und
  erzeugt die Bridge mit `enable_ipv6=false`. Dual-Stack-Hosts brauchen
  nichts.
- **Demo-leane Defaults**: ClamAV und Full-Text-Search sind aus
  (`MAILCOW_SKIP_CLAMD`/`MAILCOW_SKIP_FTS`), damit der Stack neben dem
  OpenSME-Kern in ~2 GB RAM passt. Für Produktion: beide auf `n`.
- **Kein OIDC in der gepinnten Version**: mailcow 2026-09 authentifiziert
  gegen seine eigene Mailbox-DB. IdP-gebundenes SSO für die Admin-UI ist
  Follow-up, kein brav - die Journeys dokumentieren den Ist-Zustand.

---

## Running

```bash
# demo stack (bootstrap + full flows):
./scripts/demo.sh
python3 tests/run.py --e2e --domain opensme.local

# operator broadcast journey (recreates the portal — CI runs it after the suite):
python3 tests/05-e2e/broadcast.py opensme.local

# resilience journey (bounces postgres + zitadel — CI runs it after the suite):
python3 tests/05-e2e/resilience.py opensme.local

# backup journey (runs scripts/backup.sh, audits the artifacts):
python3 tests/05-e2e/backup.py

# exposure + runtime truth (read-only operator audits):
python3 tests/05-e2e/exposure.py opensme.local
python3 tests/05-e2e/runtime_truth.py

# local AI journey (recreates the portal against a stdlib AI mock):
python3 tests/05-e2e/ai_journey.py opensme.local

# mailcow journey (requires the submodule + `scripts/mailcow.sh up`):
git submodule update --init mail/mailcow-dockerized
scripts/mailcow.sh up mail.opensme.local
python3 tests/05-e2e/mailcow_journey.py opensme.local
scripts/mailcow.sh down

# static-ish subset (no credentials needed):
python3 tests/05-e2e/run.py opensme.local --skip-flows

# CI runs the full suite against a fresh demo stack on every push to main.
```

Credentials: `ZITADEL_ADMIN_PASSWORD` from `.env`; the runner bootstraps a
throw-away OIDC app (`e2e-sso`) via the Management API and removes it
afterwards. See [tests/README.md](../tests/README.md#e2e-tests-05-e2e--sso--friends)
for all configuration knobs.
