#!/usr/bin/env python3
"""
tests/00-static/check_boot.py — Boot-contract validation.

Encodes hard-won deployment invariants as statically checkable rules so the
classes of bugs that previously blocked real deployments are caught in CI:

  1. exec-scripts      Bind-mounted entrypoint scripts must be executable
                       (mode 100755) in git — a 0644 script mounted :ro makes
                       tini fail with "exec ...: Permission denied".
  2. core-images-pinned Core services must use pinned images (no bare :latest /
                       :rolling) — :latest has shipped breaking config models
                       (Stalwart v0.16, Zitadel v4).
  3. s6-overlay-pid1   s6-overlay images must be PID 1 -> explicit `init: false`
                       (the shared x-service-defaults anchor sets init: true).
  4. no-cap_drop-all-on-setuid
                       Images that drop privileges to a dedicated uid cannot
                       have cap_drop: ALL (breaks CAP_SETUID/SETGID/DAC_OVERRIDE).
  5. traefik-ping      Traefik must expose ping on an entrypoint and use a
                       matching `traefik healthcheck --ping.entryPoint=...`.
  6. zitadel-boot      Zitadel container command must mount the masterkey file
                       and use --tlsMode external (TLS terminated by Traefik).
  7. opencloud-entrypoint
                       openCloud must boot via /entrypoint.sh (not /bin/sh).
  8. minio-traefik     MinIO routers must pin an explicit service (avoid the
                       "cannot be linked automatically with multiple Services"
                       Traefik error).
  9. healthcheck-bins  Healthchecks may only reference binaries known to exist
                       in the service image.

Usage:
    python3 tests/00-static/check_boot.py

Exit codes:
    0 = all boot contracts satisfied
    1 = a boot contract was violated
"""

import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from conftest import ComposeLoader, Result, ROOT


# ── 2. Images that must be pinned (tag != latest/rolling) ──────────────
# Core services: a :latest update silently changes config/boot models.
CORE_PINNED = {
    "traefik", "postgres", "redis", "memcached", "pgbouncer",
    "stalwart", "zitadel", "opencloud", "collabora", "portal", "minio",
}

# Images that legitimately track a rolling line (documented; their own
# migration/boot story handles upgrades). Adding more here needs intent.
MUTABLE_IMAGES = {
    "minio",            # RELEASE-speed rolling; self-contained S3 daemon
    "sogo",             # salvoxia/sogo:latest is the only maintained tag
    "paperless-ngx",    # official guidance: track :latest for migrations
    "invoiceninja",     # major-version tag (invoiceninja:5), battletested
    "gotenberg",        # major-version tag (gotenberg:8)
    "tika",             # apache/tika:latest, optional profile
    "casdoor",          # optional demo IAM, auth playground only
    "dev-agent",        # built from repo source (role uses a local version tag)
    "predictive-agent",
    "taskfleet",
    "ollama",
}
# Any service whose image resolves to a bare mutable tag but is NOT in this
# list fails; unknown images default to requiring a pinned tag.

# ── 3. Images whose entrypoint is s6-overlay (must be PID 1) ───────────
S6_OVERLAY_IMAGES = {
    "paperless-ngx": True,
}

# ── 4. Images that drop to a dedicated uid / need privilege transitions ─
SETUID_IMAGES = {
    "postgres", "redis", "memcached", "pgbouncer", "stalwart", "sogo",
    "gotenberg", "paperless-ngx", "tika", "opencloud", "collabora", "zitadel",
}
# Images that run as root by design and manage their own privileges.
CAP_DROP_ALL_OK = {"traefik", "minio", "portal", "dev-agent"}

# Intentionally simplistic image<->service mapping used by the checks below.
# Keyed by service name as defined in the compose files.
IMAGE_OF = {
    "traefik": "traefik",
    "postgres": "postgres",
    "pgbouncer": "pgbouncer",
    "redis": "redis",
    "memcached": "memcached",
    "portal": "portal",
    "zitadel": "zitadel",
    "opencloud": "opencloud",
    "collabora": "collabora",
    "minio": "minio",
    "stalwart": "stalwart",
    "sogo": "sogo",
    "paperless-ngx": "paperless-ngx",
    "paperless-gotenberg": "gotenberg",
    "paperless-tika": "tika",
    "invoiceninja": "invoiceninja",
    "dev-agent": "dev-agent",
}

# ── 9. Allowed healthcheck binaries per service image ──────────────────
HEALTHCHECK_BINS = {
    "traefik": ["traefik"],
    "postgres": ["pg_isready"],
    "pgbouncer": ["psql"],
    "redis": ["redis-cli"],
    "memcached": ["nc"],
    "portal": ["busybox", "wget"],
    "zitadel": ["zitadel", "/app/zitadel"],
    "opencloud": ["curl"],
    "collabora": ["curl"],
    "minio": ["mc"],
    "stalwart": ["bash"],
    "sogo": ["curl"],
    "paperless-ngx": ["curl"],
    "gotenberg": ["curl"],
    "tika": ["curl"],
    "invoiceninja": ["curl"],
    "dev-agent": ["curl"],
}


def git_mode(path: str) -> str:
    """Return the mode recorded in the git index for a tracked file, or ''."""
    try:
        out = subprocess.run(
            ["git", "ls-files", "-s", "--", path],
            capture_output=True, text=True, cwd=str(ROOT), timeout=10,
        ).stdout
    except Exception:
        return ""
    if not out.strip():
        return ""
    return out.split()[0]


def flatten_command(svc_data: dict) -> list[str]:
    """Entry: entrypoint+command as a flat list of tokens for matching."""
    tokens: list[str] = []
    for key in ("entrypoint", "command"):
        val = svc_data.get(key)
        if not val:
            continue
        if isinstance(val, str):          # e.g. "server"
            tokens.append(val)
        elif isinstance(val, list):
            for item in val:
                if isinstance(item, str):
                    tokens.append(item)
    return tokens


def image_tag(value: str) -> str:
    """Return the tag component of an image string (after last ':')."""
    return value.rsplit(":", 1)[-1] if ":" in value else ""


def main():
    result = Result("check-boot")
    result.header("Layer 0: boot-contract validation")

    loader = ComposeLoader(ROOT)
    loader.load()
    services = loader.services

    # ── 1. Executable bind-mounted entrypoint scripts ──────────────────
    result.info("Check 1: bind-mounted entrypoint scripts are executable in git")
    for svc in services.values():
        data = svc["data"]
        tokens = flatten_command(data)
        sh_refs = {t.removeprefix("/") for t in tokens if t.endswith(".sh")}
        if not sh_refs:
            continue
        for vol in data.get("volumes") or []:
            if not isinstance(vol, str) or ":" not in vol:
                continue
            src, dst = (p.strip() for p in vol.rsplit(":", 1)[:2])
            dst_target = dst.split(":")[0].lstrip("/")
            if not dst_target.endswith(".sh"):
                continue
            if dst_target in sh_refs and src.endswith(".sh"):
                mode = git_mode(src)
                if mode.startswith("100755"):
                    result.ok(f"{svc['name']}: {src} executable in git (100755)")
                else:
                    result.fail(
                        f"{svc['name']}: {src} is mounted as entrypoint "
                        f"{dst_target} but has git mode {mode or 'UNTRACKED'}; "
                        f"must be 100755 (tini/execlp fails on :ro 0644)"
                    )

    # ── 2. Core images pinned ──────────────────────────────────────────
    result.info("Check 2: core service images are pinned (no bare latest/rolling)")
    for svc in services.values():
        name = svc["name"]
        img = (svc["data"].get("image") or "").strip()
        if not img:
            continue
        base = IMAGE_OF.get(name, name)
        tag = image_tag(img)
        mutable = base in MUTABLE_IMAGES and name in MUTABLE_IMAGES
        if base in CORE_PINNED and not mutable and tag in ("latest", "rolling"):
            result.fail(
                f"{name}: image '{img}' uses bare tag '{tag}'; pin a concrete "
                f"version (e.g. via ${name.upper()}_IMAGE in .env.example)"
            )
        elif not mutable and tag in ("latest", "rolling") and base not in CORE_PINNED:
            result.warn(
                f"{name}: image '{img}' unpinned and not cataloged; add to "
                f"MUTABLE_IMAGES if intentional"
            )
        else:
            result.ok(f"{name}: image '{img}' acceptable")

    # ── 3. s6-overlay must be PID 1 ────────────────────────────────────
    result.info("Check 3: s6-overlay images explicitly opt out of init (PID 1)")
    for svc in services.values():
        name = svc["name"]
        img = (svc["data"].get("image") or "")
        if name in S6_OVERLAY_IMAGES or any(m in img for m in S6_OVERLAY_IMAGES):
            init_val = svc["data"].get("init")
            if init_val is False:
                result.ok(f"{name}: init: false (s6-overlay keeps PID 1)")
            else:
                result.fail(
                    f"{name}: s6-overlay image must run as PID 1 — set "
                    f"`init: false` (the shared anchor sets init: true/tini)"
                )

    # ── 4. cap_drop: ALL forbidden on setuid/dropping images ───────────
    result.info("Check 4: no cap_drop: ALL on images that drop privileges")
    for svc in services.values():
        name = svc["name"]
        data = svc["data"]
        cap_drop = data.get("cap_drop") or []
        if "ALL" not in cap_drop:
            continue
        if name in CAP_DROP_ALL_OK:
            result.ok(f"{name}: cap_drop ALL ok (root-run, self-managed caps)")
            continue
        result.fail(
            f"{name}: cap_drop: ALL removed CAP_SETUID/SETGID/DAC_OVERRIDE "
            f"needed by setuid images; drop only the specific caps"
        )

    # ── 5. Traefik ping contract ───────────────────────────────────────
    result.info("Check 5: Traefik ping entrypoint + healthcheck agree")
    traefik = services.get("traefik")
    if traefik:
        cmd = flatten_command(traefik["data"])
        hc = traefik["data"].get("healthcheck") or {}
        hc_test = hc.get("test") or []
        ok_ping = any("--ping=true" in c for c in cmd)
        ok_ep = any("--ping.entryPoint=web" in c for c in cmd)
        ok_hc = any("ping.entryPoint=web" in str(t) for t in hc_test)
        if ok_ping and ok_ep and ok_hc:
            result.ok("traefik: --ping + --ping.entryPoint=web + matching healthcheck")
        else:
            for cond, msg in (
                (ok_ping, "--ping=true in command"),
                (ok_ep, "--ping.entryPoint=web in command"),
                (ok_hc, "healthcheck uses traefik healthcheck --ping.entryPoint=web"),
            ):
                if not cond:
                    result.fail(f"traefik: missing {msg}")

    # ── 6. Zitadel boot contract ───────────────────────────────────────
    result.info("Check 6: Zitadel masterkey + external TLS")
    zitadel = services.get("zitadel")
    if zitadel:
        cmd = flatten_command(zitadel["data"])
        img = (zitadel["data"].get("image") or "")
        ok_key = any("masterkeyFile" in c or "MASTERKEY" in str(c).upper() for c in cmd)
        ok_tls = any(c == "external" or "--tlsMode" in c for c in cmd)
        ok_pinned = image_tag(img) not in ("latest", "rolling")
        if ok_key and ok_tls and ok_pinned:
            result.ok("zitadel: masterkeyFile + --tlsMode external + pinned image")
        else:
            if not ok_key:
                result.fail("zitadel: command must pass --masterkeyFile /secrets/masterkey")
            if not ok_tls:
                result.fail("zitadel: needs --tlsMode external (Traefik terminates TLS)")
            if not ok_pinned:
                result.fail(f"zitadel: image {img} must be pinned (current images "
                            "fail fresh installs)")

    # ── 7. openCloud entrypoint contract ───────────────────────────────
    result.info("Check 7: openCloud boots via /entrypoint.sh")
    oc = services.get("opencloud")
    if oc:
        ep = oc["data"].get("entrypoint") or []
        ok_ep = ep == ["/entrypoint.sh"]
        cmd = flatten_command(oc["data"])
        ok_cmd = any(c == "server" for c in cmd) or "server" in cmd
        if ok_ep and ok_cmd:
            result.ok("opencloud: entrypoint /entrypoint.sh + server command")
        else:
            if not ok_ep:
                result.fail(
                    f"opencloud: entrypoint must be ['/entrypoint.sh'] "
                    f"(got {ep}); '/bin/sh' can't open the 'server' command file"
                )
            if not ok_cmd:
                result.fail("opencloud: command must be ['server']")

    # ── 8. MinIO explicit Traefik services ─────────────────────────────
    result.info("Check 8: MinIO routers pin explicit Traefik services")
    minio = services.get("minio")
    if minio:
        labels = " ".join(minio["data"].get("labels") or [])
        ok_api = "routers.minio.service=minio-api" in labels
        ok_console = "routers.minio-console.service=minio-console" in labels
        if ok_api and ok_console:
            result.ok("minio: routers pin minio-api / minio-console services")
        else:
            result.fail(
                "minio: routers must explicitly pin traefik services "
                "(routers.minio.service=minio-api, "
                "routers.minio-console.service=minio-console) to avoid the "
                "'cannot be linked automatically with multiple Services' error"
            )

    # ── 9. Healthcheck binaries exist in image ─────────────────────────
    result.info("Check 9: healthchecks use binaries present in the image")
    for svc in services.values():
        name = svc["name"]
        hc = (svc["data"].get("healthcheck") or {}).get("test") or []
        if not hc:
            continue
        base = IMAGE_OF.get(name, name)
        allowed = HEALTHCHECK_BINS.get(base, [])
        if not allowed:
            result.skip(f"{name}: no binary allowlist, skipped")
            continue
        # Extract the binary that actually gets executed:
        #   ["CMD", "curl", ...]            -> "curl"
        #   ["CMD-SHELL", "curl -sf ..."]  -> first shell token
        if hc[0] == "CMD" and len(hc) > 1:
            binary = hc[1]
        elif hc[0] == "CMD-SHELL" and len(hc) > 1:
            binary = hc[1].lstrip().split()[0] if hc[1].strip() else ""
        else:
            result.skip(f"{name}: unusual healthcheck form, skipped")
            continue
        binary = binary.rsplit("/", 1)[-1]  # /app/zitadel -> zitadel
        if binary in allowed or f"/{binary}" in allowed:
            result.ok(f"{name}: healthcheck binary '{binary}' in image")
        else:
            result.fail(
                f"{name}: healthcheck binary '{binary}' not in image allowlist "
                f"{allowed} (e.g. gotenberg ships curl, not wget)"
            )

    return result.summary()


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
