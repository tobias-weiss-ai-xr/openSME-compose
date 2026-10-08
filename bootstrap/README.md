# bootstrap/ — Seed Data & Demo Content

This directory contains seed data and bootstrap scripts to populate openSME
services with meaningful demo content on a fresh deployment.

## bpmn/

Sample BPMN 2.0 process definitions for the Operaton workflow engine
(`--profile camunda`).

| File | Process | Description |
|------|---------|-------------|
| `invoice-approval.bpmn` | `invoice-approval` | Two-stage invoice approval: auto-approve ≤ 500, manager approval > 500, archive to File-Cloud on approve, notify on reject |

### Deploying

```bash
# Engine running locally (default):
./bootstrap/bpmn-deploy.sh

# Engine on a remote host:
BPM_URL=https://bpm.example.org ./bootstrap/bpmn-deploy.sh
```

The script waits for the engine to be ready, then deploys every `.bpmn`
file via `POST /engine-rest/deployment/create`. Re-running updates
existing deployments (idempotent).

After deployment, the process is available in:
- **Cockpit**: `https://bpm.<domain>/operaton/app/cockpit/`
- **Tasklist**: `https://bpm.<domain>/operaton/app/tasklist/`
- **REST API**: `POST https://bpm.<domain>/engine-rest/process-definition/key/invoice-approval/start`

### Starting a process instance

```bash
curl -X POST "https://bpm.<domain>/engine-rest/process-definition/key/invoice-approval/start" \
  -H "Content-Type: application/json" \
  -d '{"variables": {"amount": {"value": 750, "type": "Integer"}, "manager": {"value": "demo", "type": "String"}}, "businessKey": "INV-2026-001"}'
```
