#!/usr/bin/env python3
"""
tests/00-static/check_bootstrap.py — Layer 0 lint for seed/bootstrap data.

The portal "Workflow" card and the Operaton engine advertise seed BPMN
processes from bootstrap/bpmn/. Broken seed data must fail in CI, not at
demo time — Operaton rejects a deployment (HTTP 400) when:

  * the XML is not well-formed,
  * IDs collide within a deployment (cvc-id.2),
  * the <process> element carries no operaton:historyTimeToLive
    (ENGINE-12018 — "History Time To Live (TTL) cannot be null"),
  * a serviceTask uses a bare boolean operaton:expression (ClassCastException
    at instance start: Boolean cannot be cast to String),
  * a <conditionExpression> omits the xsi namespace declaration.

Usage: python3 tests/00-static/check_bootstrap.py
"""

import sys
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from conftest import Result, ROOT  # noqa: E402

BPMN_DIR = ROOT / "bootstrap" / "bpmn"
DEPLOY_SCRIPT = ROOT / "bootstrap" / "bpmn-deploy.sh"
OPERATON_NS = "http://operaton.org/schema/1.0/bpmn"


def local(tag: str) -> str:
    """Strip the {namespace} prefix from an ElementTree tag."""
    return tag.rsplit("}", 1)[-1]


def check_file(path: Path, result: Result) -> None:
    name = path.name
    raw = path.read_text()
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError as e:
        result.fail(f"{name}: XML is not well-formed: {e}")
        return
    result.ok(f"{name}: XML well-formed")

    # ── unique IDs across the whole document ──────────────────────
    ids = [e.get("id") for e in root.iter() if e.get("id")]
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    if dupes:
        result.fail(f"{name}: duplicate id(s) — Operaton rejects cvc-id.2: {dupes}")
    else:
        result.ok(f"{name}: {len(ids)} unique id(s)")

    # ── every process needs a history TTL + an id distinct from <definitions>
    processes = [e for e in root.iter() if local(e.tag) == "process"]
    if not processes:
        result.fail(f"{name}: no <process> element")
        return
    definition_id = root.get("id")
    for proc in processes:
        pid = proc.get("id")
        ttl = proc.get(f"{{{OPERATON_NS}}}historyTimeToLive")
        if not ttl:
            result.fail(
                f"{name}: process {pid!r} has no operaton:historyTimeToLive "
                "(ENGINE-12018 — deployment would be rejected)"
            )
        else:
            result.ok(f"{name}: process {pid!r} historyTimeToLive={ttl}")
        if pid and pid == definition_id:
            result.fail(f"{name}: process id collides with <definitions> id ({pid!r})")

    # ── serviceTasks must not use a bare boolean expression ───────
    for task in root.iter():
        if local(task.tag) != "serviceTask":
            continue
        expr = task.get(f"{{{OPERATON_NS}}}expression")
        if expr is None:
            continue
        body = expr.strip()
        if body in ("${true}", "${false}"):
            result.fail(
                f"{name}: serviceTask {task.get('id')!r} uses bare boolean {body} "
                "— ClassCastException at start (use execution.setVariable(...))"
            )
        else:
            result.ok(f"{name}: serviceTask {task.get('id')!r} expression ok")

    # ── conditionExpression needs the xsi namespace in scope ──────
    if "conditionExpression" in raw and "xmlns:xsi=" not in raw:
        result.fail(f"{name}: conditionExpression without xmlns:xsi declaration")
    elif "conditionExpression" in raw:
        result.ok(f"{name}: conditionExpression xsi namespace declared")


def check_deploy_script(result: Result) -> None:
    if not DEPLOY_SCRIPT.is_file():
        result.fail("bootstrap/bpmn-deploy.sh missing")
        return
    result.ok("bootstrap/bpmn-deploy.sh present")
    if not DEPLOY_SCRIPT.stat().st_mode & 0o111:
        result.fail("bootstrap/bpmn-deploy.sh is not executable")
    else:
        result.ok("bootstrap/bpmn-deploy.sh executable")


def main() -> int:
    result = Result("bootstrap-seed-data")
    if not BPMN_DIR.is_dir():
        result.fail(f"{BPMN_DIR} missing")
        return 0 if result.summary() else 1

    files = sorted(BPMN_DIR.glob("*.bpmn"))
    if not files:
        result.fail("bootstrap/bpmn/ has no .bpmn files")
    for f in files:
        check_file(f, result)
    check_deploy_script(result)
    return 0 if result.summary() else 1


if __name__ == "__main__":
    sys.exit(main())
