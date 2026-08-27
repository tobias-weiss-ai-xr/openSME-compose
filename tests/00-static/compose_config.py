#!/usr/bin/env python3
"""
tests/00-static/compose_config.py — Real `docker compose config` gate.

PyYAML is lenient in ways the actual Docker Compose engine (go-yaml) is not:
duplicate `<<` merge keys ("mapping key \\"<<\\" already defined"), empty-list
overrides of anchored lists (security_opt: []), and permissive types all pass
`yaml.safe_load` but abort every real `docker compose up`.

This test shells out to the REAL `docker compose config` CLI for every
plausible file-set / profile combination (mirroring the deployment matrix) and
fails if any of them fails to parse.

The test self-skips (warn) when the Docker CLI or compose v2 plugin is not
available (e.g. minimal CI). On workstations and the deploy host it must pass.

Usage:
    python3 tests/00-static/compose_config.py

Exit codes:
    0 = all combinations produce valid config (or docker unavailable)
    1 = at least one combination failed to parse
"""

import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from conftest import Result, ROOT


# One tuple per combination: (label, [compose files], [profiles], tier)
# Mirrors the ansible role's deployment matrix (standalone/invoice/paperless)
# plus per-service and per-tier views.
MATRIX = [
    ("base", ["docker-compose.yml"], ["standalone"], None),
    ("base+iam", ["docker-compose.yml", "idm/zitadel.yml"], ["standalone"], None),
    ("base+files", ["docker-compose.yml", "opencloud/opencloud.yml",
                    "opencloud/minio.yml"], ["standalone"], None),
    ("base+mail", ["docker-compose.yml", "mail/stalwart.yml", "mail/sogo.yml"],
     ["standalone"], None),
    ("base+invoice", ["docker-compose.yml", "services/invoice-ninja.yml"],
     ["invoice"], None),
    ("base+paperless", ["docker-compose.yml", "services/paperless.yml"],
     ["paperless"], None),
    ("base+agent", ["docker-compose.yml", "monitoring/dev-agent.yml"],
     ["standalone"], None),
    # Full deploy set for each RAM tier
    ("soho", ["docker-compose.yml", "idm/zitadel.yml",
              "opencloud/opencloud.yml", "opencloud/minio.yml",
              "mail/stalwart.yml", "mail/sogo.yml",
              "services/invoice-ninja.yml", "services/paperless.yml",
              "monitoring/dev-agent.yml", "profiles/soho.yml"],
     ["standalone", "invoice", "paperless"], "soho"),
    ("small", ["docker-compose.yml", "idm/zitadel.yml",
               "opencloud/opencloud.yml", "opencloud/minio.yml",
               "mail/stalwart.yml", "mail/sogo.yml",
               "services/invoice-ninja.yml", "services/paperless.yml",
               "monitoring/dev-agent.yml", "profiles/small.yml"],
     ["standalone", "invoice", "paperless"], "small"),
    ("medium", ["docker-compose.yml", "idm/zitadel.yml",
                "opencloud/opencloud.yml", "opencloud/minio.yml",
                "mail/stalwart.yml", "mail/sogo.yml",
                "services/invoice-ninja.yml", "services/paperless.yml",
                "monitoring/dev-agent.yml", "profiles/medium.yml"],
     ["standalone", "invoice", "paperless"], "medium"),
]


def docker_compose_available() -> bool:
    return shutil.which("docker") is not None


def has_compose_plugin() -> bool:
    try:
        out = subprocess.run(["docker", "compose", "version"],
                             capture_output=True, text=True, timeout=20)
        return out.returncode == 0
    except Exception:
        return False


def run_config(files: list[str], profiles: list[str]) -> tuple[bool, str]:
    """Run `docker compose -f ... --profile ... config --quiet`."""
    cmd = ["docker", "compose"]
    for f in files:
        cmd += ["-f", str(ROOT / f)]
    for p in profiles:
        cmd += ["--profile", p]
    # Use an empty environment-image default resolution; prefer quiet validation
    cmd += ["config", "--quiet"]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True,
                             timeout=120, cwd=str(ROOT))
        return out.returncode == 0, (out.stderr or out.stdout).strip()
    except subprocess.TimeoutExpired:
        return False, "timed out"
    except Exception as e:  # noqa: BLE001
        return False, str(e)


def main():
    result = Result("compose-config")
    result.header("Layer 0: real `docker compose config` gate")

    if not docker_compose_available():
        result.warn("Docker CLI not found — skipping the real compose-config "
                    "gate (install docker compose to enable it locally)")
        return result.summary()

    if not has_compose_plugin():
        result.warn("`docker compose` v2 plugin not found — skipping")
        return result.summary()

    ok_all = True
    for label, files, profiles, tier in MATRIX:
        missing = [f for f in files if not (ROOT / f).exists()]
        if missing:
            result.skip(f"[{label}] missing files {missing} (not in this "
                        "install profile)")
            continue
        ok, err = run_config(files, profiles)
        if ok:
            tier_note = f" ({tier} tier)" if tier else ""
            result.ok(f"[{label}] compose config OK{tier_note}")
        else:
            ok_all = False
            first = err.splitlines()[0][:220] if err else "(no error output)"
            result.fail(f"[{label}] docker compose config FAILED: {first}")

    if ok_all:
        result.info("All file-set/profile combinations parse with the real "
                    "Docker Compose engine (go-yaml).")
    return result.summary()


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
