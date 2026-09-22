#!/usr/bin/env python3
"""
check_agent.py — Layer 0 static lint for the dev-maintenance-bot.

Validates (dev-agent + dev-agent-compose + dev-agent-knowledge specs):
  1. monitoring/dev-agent.yml wires the bot safely:
     - /var/run/docker.sock mounted READ-ONLY
     - no published host ports
     - restart: "no" (one-shot)
  2. opensme-knowledge/*.json runbooks parse, schema == 1, and every
     core service has a runbook.

Usage: python3 tests/00-static/check_agent.py
"""

import json
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
OVERLAY = ROOT / "monitoring" / "dev-agent.yml"
KB = ROOT / "opensme-knowledge"
CORE_SERVICES = {
    "traefik", "postgres", "zitadel", "stalwart",
    "sogo", "opencloud", "invoice-ninja", "paperless",
}
SERVICE = "dev-maintenance-bot"


def check_compose() -> list[str]:
    errors = []
    doc = yaml.safe_load(OVERLAY.read_text())
    svc = (doc.get("services") or {}).get(SERVICE)
    if svc is None:
        return [f"{OVERLAY.name}: service '{SERVICE}' missing"]

    ro_sock = any(
        "/var/run/docker.sock" in str(v) and str(v).rstrip().endswith(":ro")
        for v in (svc.get("volumes") or [])
    )
    if not ro_sock:
        errors.append("docker.sock must be mounted :ro")

    if svc.get("ports"):
        errors.append("no host ports may be published for the agent API")

    if svc.get("restart") != "no":
        errors.append(f'restart must be "no" (one-shot), got {svc.get("restart")!r}')
    return errors


def check_knowledge() -> list[str]:
    errors = []
    if not KB.is_dir():
        return [f"{KB}: knowledge base directory missing"]
    seen = set()
    for f in sorted(KB.glob("*.json")):
        try:
            doc = json.loads(f.read_text())
        except json.JSONDecodeError as e:
            errors.append(f"{f.name}: malformed runbook JSON: {e}")
            continue
        if doc.get("schema") != 1:
            errors.append(f"{f.name}: schema must be 1")
        svc = doc.get("service", "")
        if svc != f.stem:
            errors.append(f"{f.name}: service {svc!r} does not match file name")
        if not doc.get("runbooks"):
            errors.append(f"{f.name}: no runbooks")
        seen.add(svc)
    missing = CORE_SERVICES - seen
    if missing:
        errors.append(f"core services without runbook: {sorted(missing)}")
    return errors


def main() -> int:
    errors = check_compose() + check_knowledge()
    if errors:
        for e in errors:
            print(f"  ❌ {e}")
        print("❌ dev-maintenance-bot static check: FAILED")
        return 1
    print("  ✅ compose wiring (ro socket, no ports, one-shot)")
    print(f"  ✅ knowledge base: {len(list(KB.glob('*.json')))} services incl. all {len(CORE_SERVICES)} core services")
    print("✅ dev-maintenance-bot static check: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
