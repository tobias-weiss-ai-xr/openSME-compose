## 1. Image verification

- [x] 1.1 Identify the current stable Operaton release and its Docker Hub tag; record exact pinned tag for `CAMUNDA_IMAGE`
- [x] 1.2 Pull the image locally and inspect the entrypoint: confirm `DB_*` datasource env contract matches `services/camunda.yml` wiring (driver present for PostgreSQL)
- [x] 1.3 Smoke-start the container standalone against a throwaway Postgres: engine boots, schema auto-creates, Cockpit/Tasklist served on `:8080`

## 2. Compose integration

- [x] 2.1 Update `services/camunda.yml` to the pinned Operaton image; keep profile gating, Postgres service/credentials wiring, Traefik labels, networks unchanged (adjust env names only if 1.2 found mismatches)
- [x] 2.2 Update `.env.example`: `CAMUNDA_IMAGE` default → pinned Operaton tag; comment notes Operaton as successor of Camunda 7 CE (Apache 2.0)
- [x] 2.3 Verify full-profile deploy: `--profile camunda` up → `bpm.<domain>` route serves the engine login over HTTPS; `--profile camunda` down leaves no engine resources

## 3. Contract & docs

- [x] 3.1 Document the REST-only integration contract (no `org.camunda.*`/`org.operaton.*` deps in stack-owned images) in the service docs
- [x] 3.2 Update docs/README references: Camunda 7 → Operaton, including EOL rationale and license note; confirm no internal hostnames/secrets introduced (CI scan must stay green)
- [x] 3.3 Add the pinned image to the image-cadence documentation (MUTABLE_IMAGES/upgrade notes) so monthly Operaton patches get tracked

## 4. Tests & CI

- [x] 4.1 Update `tests/run.py` camunda checks (static compose assertions + health probe) to the new image and run the relevant test layers green
- [x] 4.2 CI pipeline green on the change branch (secret-scan, leak-scan, compose validation, test pyramid layers touched by the profile)
