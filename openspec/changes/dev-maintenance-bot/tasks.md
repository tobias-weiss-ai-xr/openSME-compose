## 1. Foundation — knowledge base, Go module, config

- [ ] 1.1 Create opensme-knowledge/ knowledge base root: runbook JSON schema + README describing service/symptom/diagnosis/remediation records
- [ ] 1.2 Seed opensme-knowledge entries for core services (traefik, postgres, casdoor, stalwart, sogo, opencloud, invoice-ninja, paperless)
- [ ] 1.3 Initialize Go module opensme-dev-agent (go.mod, module path, directory layout for internal packages)
- [ ] 1.4 Create internal/config package: env-driven config with DEV_AGENT_* defaults (interval, watch list, llm backend, allow-heal, state dir)
- [ ] 1.5 Document DEV_AGENT_* variable defaults for the agent in .env.example

## 2. Knowledge, checker and healer core packages

- [ ] 2.1 Create internal/knowledge package: //go:embed the opensme-knowledge JSON and query by service/symptom
- [ ] 2.2 Write internal/knowledge unit tests using Go testing (load, query-by-service, query-by-symptom, empty KB)
- [ ] 2.3 Create internal/checker package: container health detection via docker CLI over a read-only docker.sock (restarting/exited/OOM/ImagePullBackOff, log error spikes)
- [ ] 2.4 Write internal/checker unit tests with Go testing (state classification, restart counts, resource pressure)
- [ ] 2.5 Create internal/healer package: remediation actions (restart, prune dry-run, wait) with dry-run default

## 3. Healer tests, REST API and LLM analysis

- [ ] 3.1 Write internal/healer unit tests using Go testing (dry-run no-op, allow-heal path, receipt emission)
- [ ] 3.2 Create internal/api REST server with GET /status, GET /healthz, GET /ready, GET /history, GET /evidence, POST /heal endpoints
- [ ] 3.3 Write internal/api unit tests with Go testing covering each endpoint
- [ ] 3.4 Add LLM analysis integration to internal/api via env-driven backend (ollama/saia/tud/openai; off by default) fed only anonymized context
- [ ] 3.5 Add history/cache persistence to internal/api writing JSON state to the DEV_AGENT_STATE_DIR volume

## 4. Privacy — strip-then-review anonymization

- [ ] 4.1 Create anonymizer/stripper in internal/api: strip secrets, RFC1918/link-local IPs, hostnames and user paths before any outbound LLM call
- [ ] 4.2 Write internal/api anonymizer unit tests using Go testing (TestAnonymize) proving stripped fields are replaced and never logged
- [ ] 4.3 Add review/evidence log: /evidence records every stripped field (what, where, why) for audit
- [ ] 4.4 Create anonymization manifest: privacy-preserving contribution policy for feeding stripped runbook patterns back into opensme-knowledge

## 5. Wiring main, Dockerfile, compose and Makefile

- [ ] 5.1 Wire main.go assembling config → knowledge → checker → healer → api with signal handling
- [ ] 5.2 Create opensme-dev-agent Dockerfile (multi-stage, builds static Go binary, minimal runtime image)
- [ ] 5.3 Add dev-agent sidecar to docker-compose.yml (read-only docker.sock mount, state volume, restart "no", private port 8081)
- [ ] 5.4 Add Makefile targets agent-build and agent-status for the dev-agent
- [ ] 5.5 Add RAM budget check entry using tests/00-static/sum-memory.awk so the agent stays under ~128 MB

## 6. Pi extension

- [ ] 6.1 Create .pi/extensions/opensme-dev-agent.ts and register the agent with registerCommand scaffolding
- [ ] 6.2 Add agent discovery capability via com.opensme.agent registration in .pi/extensions/opensme-dev-agent.ts
- [ ] 6.3 Wire the /status command in the pi extension to the agent REST endpoint
- [ ] 6.4 Wire the /heal command in the pi extension with an explicit confirmation prompt
- [ ] 6.5 Wire the /diag command in the pi extension to gather and triage container symptoms

## 7. Validation, tests and documentation

- [ ] 7.1 Add static lint check for the docker.sock wiring in tests/00-static (Layer 0)
- [ ] 7.2 Add tests/02-container run.sh checks for the dev-agent container (image build, entrypoint, health endpoint)
- [ ] 7.3 Run full unit tests: Go test ./... -v -count=1 across opensme-dev-agent
- [ ] 7.4 Run the Layer 0 static check via tests/00-static/run.sh and fix any findings
- [ ] 7.5 Document the dev-agent in README.md (architecture, env vars, /status /heal /diag usage, private-first defaults)
- [ ] 7.6 Build and deploy the agent image and sidecar on a small tier (manual)
- [ ] 7.7 Simulate+Verify: simulate an unhealthy container, confirm heal receipt and evidence log, and verify no secrets leak into logs (manual)
