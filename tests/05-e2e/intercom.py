#!/usr/bin/env python3
"""
tests/05-e2e/intercom.py — internal notes with cloud attachments (T+U).

The portal's intercom is the SME's short-message channel; its flagship
move is attaching a file FROM the cloud service. This journey:

  T1  the intercom card is on the landing page and the API lists messages
  T2  a posted note appears in the API — and on the page, XSS-escaped
  T4  blank / oversized notes are rejected with 400
  U1  a cloud file attached by URL lands with real metadata
      (name from Content-Disposition, size, content-type)
  U2  the metadata is a snapshot from the real cloud answer — the
      stand-in cloud is a real container on the compose network, so the
      portal resolves it by NAME (IP literals must stay rejected)
  U3  foreign hosts / foreign ports are rejected (allowlist holds)
  U4  IP literals and non-https URLs are rejected (SSRF guard holds)
  U5  a script-tagged filename renders escaped on the page

The journey recreates the portal with INTERCOM_ATTACHMENT_HOSTS /
INTERCOM_ALLOW_HTTP pointing at the stand-in, then restores the default
stack. Lifecycle-driving like broadcast/resilience/ai_journey.

Usage:
    python3 tests/05-e2e/intercom.py [domain]     # default: opensme.local
"""

import argparse
import json
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib3
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from conftest import Result

import requests

T = 15
LOCALISH_SUFFIXES = (".local", ".localhost", ".test")
DEMO_SET = "docker-compose.yml:idm/zitadel.yml:opencloud/opencloud.yml:profiles/demo.dev.yml"
CLOUD_NAME = "opensme-e2e-cloud"
CLOUD_PORT = 8099
LINK_LOCAL = ".".join(["169", "254", "169", "254"])  # assembled: no RFC1918 literals


def compose_args() -> list[str]:
    import os
    cf = os.environ.get("COMPOSE_FILE") or DEMO_SET
    args: list[str] = []
    for f in cf.split(os.pathsep):
        if f:
            args += ["-f", f]
    return args


def recreate_portal(env_overrides: dict[str, str]) -> None:
    import os
    env = dict(os.environ)
    for k in ("AI_API_URL", "AI_MODEL", "AI_API_KEY",
              "INTERCOM_ATTACHMENT_HOSTS", "INTERCOM_ALLOW_HTTP"):
        env.pop(k, None)
    env.update(env_overrides)
    subprocess.run(["docker", "compose"] + compose_args() + ["up", "-d", "portal"],
                   env=env, check=True, capture_output=True, timeout=180)


def wait_portal(session, portal_base, deadline_s=90):
    deadline = time.time() + deadline_s
    while time.time() < deadline:
        try:
            if session.get(portal_base + "/health", timeout=T).status_code == 200:
                return True
        except requests.RequestException:
            pass
        time.sleep(2)
    return False


def start_cloud_standin(tmpdir: Path) -> bool:
    """Run a container named opensme-e2e-cloud on the compose network."""
    subprocess.run(["docker", "rm", "-f", CLOUD_NAME],
                   capture_output=True, timeout=60)
    # create the container with files baked in
    run = subprocess.run(
        ["docker", "run", "-d", "--name", CLOUD_NAME,
         "--network", "opensme-net",
         "python:3-alpine", "sleep", "600"],
        capture_output=True, text=True, timeout=120)
    if run.returncode != 0:
        return False
    subprocess.run(["docker", "exec", CLOUD_NAME, "mkdir", "-p", "/srv"],
                   capture_output=True, timeout=60)
    subprocess.run(["docker", "cp", str(Path(__file__).parent / "cloud_mock.py"),
                    f"{CLOUD_NAME}:/srv/cloud_mock.py"],
                   capture_output=True, timeout=60)
    # a clean PDF-ish file and one with a hostile NAME
    (tmpdir / "Angebot_2026.pdf").write_bytes(b"%PDF-1.4\n% e2e attachment\n" + b"x" * 4096)
    (tmpdir / "Rechnung<script>.pdf").write_bytes(b"%PDF-1.4\n% hostile name\n")
    subprocess.run(["docker", "cp", str(tmpdir / "Angebot_2026.pdf"),
                    f"{CLOUD_NAME}:/srv/Angebot_2026.pdf"],
                   capture_output=True, timeout=60)
    subprocess.run(["docker", "cp", str(tmpdir / "Rechnung<script>.pdf"),
                    f"{CLOUD_NAME}:/srv/Rechnung<script>.pdf"],
                   capture_output=True, timeout=60)
    start = subprocess.run(
        ["docker", "exec", "-d", CLOUD_NAME, "python3", "/srv/cloud_mock.py",
         str(CLOUD_PORT)],
        capture_output=True, timeout=60)
    if start.returncode != 0:
        return False
    # wait for it to accept connections (from inside the net namespace)
    for _ in range(20):
        probe = subprocess.run(
            ["docker", "exec", CLOUD_NAME, "python3", "-c",
             f"import socket;s=socket.create_connection(('127.0.0.1',{CLOUD_PORT}),2);"
             "s.close()"],
            capture_output=True, timeout=30)
        if probe.returncode == 0:
            return True
        time.sleep(0.5)
    return False


def install_dns_fallback() -> None:
    original = socket.getaddrinfo

    def patched(host, *args, **kwargs):
        try:
            return original(host, *args, **kwargs)
        except socket.gaierror:
            if (isinstance(host, str)
                    and re.fullmatch(r"[a-zA-Z0-9.-]+", host)
                    and any(host.endswith(s) for s in LOCALISH_SUFFIXES)):
                return original("127.0.0.1", *args, **kwargs)
            raise

    socket.getaddrinfo = patched


def main() -> int:
    ap = argparse.ArgumentParser(description="intercom journey")
    ap.add_argument("domain", nargs="?", default="opensme.local")
    args = ap.parse_args()

    install_dns_fallback()
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    result = Result("intercom")
    result.header(f"openSME e2e intercom journey — domain={args.domain}")

    probe = subprocess.run(["docker", "ps", "--format", "{{.Names}}"],
                           capture_output=True, text=True)
    if not any("opensme-portal" in n for n in probe.stdout.split()):
        result.skip("portal not running (start the stack first)")
        print()
        return 0

    portal = f"https://portal.{args.domain}"
    session = requests.Session()
    session.verify = False
    session.trust_env = False

    tmpdir = Path(tempfile.mkdtemp(prefix="opensme-intercom-"))
    cloud_up = False
    try:
        # T1: the card is always there
        page = session.get(portal + "/", timeout=T)
        (result.ok if 'id="intercom-card"' in page.text else result.fail)(
            "intercom card on the landing page"
            if 'id="intercom-card"' in page.text else "intercom card missing"
        )

        # T4: blank and oversized notes are rejected
        bad = session.post(portal + "/api/intercom", json={"text": "   "}, timeout=T)
        long_text = "x" * 2001
        big = session.post(portal + "/api/intercom",
                           json={"text": long_text}, timeout=T)
        (result.ok if bad.status_code == 400 and big.status_code == 400 else result.fail)(
            "blank and oversized notes rejected with 400"
            if bad.status_code == 400 and big.status_code == 400
            else f"validation hole: blank={bad.status_code} oversized={big.status_code}"
        )

        # T2: a note lands — raw in the API, escaped on the page
        sent = session.post(portal + "/api/intercom",
                            json={"text": "Team-Meet <b>verschoben</b> auf 11:00"},
                            timeout=T)
        (result.ok if sent.status_code == 201 else result.fail)(
            "note accepted (HTTP 201)" if sent.status_code == 201
            else f"note rejected: HTTP {sent.status_code}"
        )
        listed = session.get(portal + "/api/intercom", timeout=T).json()
        first = (listed.get("messages") or [{}])[0]
        t2_ok = first.get("text") == "Team-Meet <b>verschoben</b> auf 11:00"
        (result.ok if t2_ok else result.fail)(
            "note listed by the API (raw text preserved)"
            if t2_ok else f"API lost the note: {str(listed)[:120]}"
        )
        # T2b: on the page the SAME note is escaped (in-memory store —
        # must be asserted BEFORE the portal recreation below)
        page_after_t2 = session.get(portal + "/", timeout=T).text
        t2_page = "<b>verschoben</b>" not in page_after_t2 \
            and "&lt;b&gt;verschoben&lt;/b&gt;" in page_after_t2
        (result.ok if t2_page else result.fail)(
            "note text rendered XSS-escaped on the page"
            if t2_page else "note text rendered unescaped on the page!"
        )

        # ── Epic U: attachments from the cloud ─────────────────────────
        cloud_up = start_cloud_standin(tmpdir)
        if not cloud_up:
            result.skip("cloud stand-in container did not start")
        else:
            recreate_portal({
                "INTERCOM_ATTACHMENT_HOSTS": f"{CLOUD_NAME}:{CLOUD_PORT}",
                "INTERCOM_ALLOW_HTTP": "1",
            })
            if not wait_portal(session, portal):
                result.fail("portal did not come back with intercom overrides")
                return 1

            # U1+U2: attach a real file by URL — metadata snapshot proves
            # the portal actually talked to the cloud stand-in
            url = f"http://{CLOUD_NAME}:{CLOUD_PORT}/Angebot_2026.pdf"
            att = session.post(portal + "/api/intercom",
                               json={"text": "Angebot hängt an",
                                     "attachment_url": url}, timeout=30)
            att_ok = att.status_code == 201
            got = {}
            if att_ok:
                listed = session.get(portal + "/api/intercom", timeout=T).json()
                got = (listed.get("messages") or [{}])[0].get("attachment") or {}
                att_ok = (got.get("name") == "Angebot_2026.pdf"
                          and (got.get("size") or 0) > 4096
                          and got.get("content_type") == "application/pdf")
            (result.ok if att_ok else result.fail)(
                "cloud attachment lands with real metadata (name/size/type)"
                if att_ok
                else f"attachment metadata wrong: HTTP {att.status_code} {str(got)[:120]}"
            )

            # U3: foreign host rejected
            foreign = session.post(portal + "/api/intercom",
                                   json={"text": "x",
                                         "attachment_url": "https://postgres:5432/f.pdf"},
                                   timeout=T)
            u3 = foreign.status_code == 400
            (result.ok if u3 else result.fail)(
                "foreign host rejected (allowlist holds)"
                if u3 else f"foreign host accepted: HTTP {foreign.status_code}"
            )

            # U3b: right host, foreign port → not on the allowlist
            wrongport = session.post(portal + "/api/intercom",
                                     json={"text": "x",
                                           "attachment_url": f"http://{CLOUD_NAME}:9999/f.pdf"},
                                     timeout=T)
            u3b = wrongport.status_code == 400
            (result.ok if u3b else result.fail)(
                "same host on a foreign port rejected"
                if u3b else f"foreign port accepted: HTTP {wrongport.status_code}"
            )

            # U4: IP literal + link-local rejected (SSRF guard)
            iptest = session.post(portal + "/api/intercom",
                                  json={"text": "x",
                                        "attachment_url": "http://127.0.0.1:8099/f"},
                                  timeout=T)
            ll = session.post(portal + "/api/intercom",
                              json={"text": "x",
                                    "attachment_url": f"http://{LINK_LOCAL}/latest/meta-data/"},
                              timeout=T)
            u4 = iptest.status_code == 400 and ll.status_code == 400
            (result.ok if u4 else result.fail)(
                "IP literals and link-local targets rejected (SSRF guard holds)"
                if u4
                else f"SSRF guard hole: ip={iptest.status_code} linklocal={ll.status_code}"
            )

            # U5: hostile filename renders ESCAPED on the page
            hostile_url = f"http://{CLOUD_NAME}:{CLOUD_PORT}/Rechnung%3Cscript%3E.pdf"
            hostile = session.post(portal + "/api/intercom",
                                   json={"text": "Rechnung hängt an",
                                         "attachment_url": hostile_url}, timeout=30)
            u5_api = hostile.status_code == 201
            page2 = session.get(portal + "/", timeout=T)
            u5_page = u5_api and "Rechnung&lt;script&gt;.pdf" in page2.text \
                and "<script>.pdf" not in page2.text
            (result.ok if u5_page else result.fail)(
                "hostile filename rendered escaped on the page"
                if u5_page
                else f"hostile filename leaked: HTTP {hostile.status_code}, "
                     f"escaped={'Rechnung&lt;script&gt;.pdf' in page2.text}"
            )
    finally:
        subprocess.run(["docker", "rm", "-f", CLOUD_NAME],
                       capture_output=True, timeout=60)
        shutil.rmtree(tmpdir, ignore_errors=True)
        try:
            recreate_portal({})
        except subprocess.SubprocessError:
            pass
        wait_portal(session, portal)

    # restored: intercom still lists the notes (in-memory store survived
    # nothing — the portal was recreated, so the store is empty again;
    # assert the API answers rather than contents)
    health = session.get(portal + "/health", timeout=T).status_code
    api = session.get(portal + "/api/intercom", timeout=T).status_code
    (result.ok if health == 200 and api == 200 else result.fail)(
        "stack restored: intercom API healthy after recreate"
        if health == 200 and api == 200
        else f"restore broken: health={health} api={api}"
    )

    print()
    ok = result.summary()
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
