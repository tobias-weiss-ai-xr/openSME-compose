/**
 * cli.ts — taskfleet v2 command router.
 *
 * Container-ready: config defaults come from TF_CONFIG_DIR (set in the Nix
 * image + compose), the ledger path from TF_STATE_DIR, and `--version` is
 * available. Native commands (--help/--status/--dry-run/--version) and the
 * dispatch loop (--once/--loop/--poll) run in TypeScript. `--legacy` bridges to
 * the legacy bash orchestrator (/opt/taskfleet/orchestrator.sh) as an escape
 * hatch during rollout.
 */
import { existsSync, readFileSync } from 'node:fs';
import { realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Ledger } from './engine/ledger.js';
import { countsFor } from './engine/board.js';
import { selectReady } from './engine/scheduler.js';
import { loadTasksJson, loadWorkersJson } from './config.js';
import { runLoop, summarize, } from './engine/loop.js';
// Runtime version from package.json (dist/cli.js → ../package.json).
const here = dirname(fileURLToPath(import.meta.url));
let VERSION = '2.0.0';
try {
    const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));
    if (typeof pkg.version === 'string')
        VERSION = pkg.version;
}
catch {
    /* keep default */
}
const LEGACY_ORCHESTRATOR = '/opt/taskfleet/orchestrator.sh';
export function parseArgs(argv) {
    const cfgDir = process.env.TF_CONFIG_DIR;
    const o = {
        tasks: cfgDir ? `${cfgDir}/tasks.json` : 'config/tasks.json',
        workers: cfgDir ? `${cfgDir}/workers.json` : 'config/workers.json',
        ledger: process.env.TF_STATE_DIR
            ? `${process.env.TF_STATE_DIR}/ledger.ndjson`
            : 'state/ledger.ndjson',
        dryRun: false,
        once: false,
        loop: false,
        legacy: false,
        status: false,
        version: false,
        help: false,
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        switch (a) {
            case '--help':
            case '-h':
                o.help = true;
                break;
            case '--version':
            case '-V':
                o.version = true;
                break;
            case '--status':
                o.status = true;
                break;
            case '--dry-run':
                o.dryRun = true;
                break;
            case '--once':
                o.once = true;
                break;
            case '--loop':
                o.loop = true;
                break;
            case '--legacy':
                o.legacy = true;
                break;
            case '--poll':
                o.poll = Number(argv[++i]) || 0;
                break;
            case '--tasks':
                o.tasks = argv[++i];
                break;
            case '--workers':
                o.workers = argv[++i];
                break;
            case '--ledger':
                o.ledger = argv[++i];
                break;
            case '--worker':
                o.worker = argv[++i];
                break;
            case '--task':
                o.task = argv[++i];
                break;
        }
    }
    return o;
}
export const HELP = `taskfleet v2 — governed, adaptive agent orchestration

Usage:
  taskfleet --help
  taskfleet --version
  taskfleet --status
  taskfleet --dry-run [--tasks FILE] [--workers FILE] [--ledger FILE]
  taskfleet [--once|--loop] [--tasks FILE] [--workers FILE] [--ledger FILE]
  taskfleet --poll N            (run to completion, sleep N sec, repeat)
  taskfleet --legacy [ARGS]     (delegate to legacy bash orchestrator)

Options:
  --tasks FILE     tasks.json path        (default: $TF_CONFIG_DIR/tasks.json or config/tasks.json)
  --workers FILE   workers.json path      (default: $TF_CONFIG_DIR/workers.json or config/workers.json)
  --ledger FILE    NDJSON event log path  (default: $TF_STATE_DIR/ledger.ndjson)
  --task ID        dispatch only this task
  --dry-run        show dispatch plan, change nothing
  --status         print status board and exit
  --once           run the native loop to completion, then exit
  --loop           alias for --once
  --poll N         repeat the loop every N seconds
  --legacy         bridge to /opt/taskfleet/orchestrator.sh
  --version        print version and exit
`;
/** Escape hatch: hand a run request to the legacy bash orchestrator. */
function bridgeToLegacy(argv) {
    if (!existsSync(LEGACY_ORCHESTRATOR)) {
        process.stderr.write(`[taskfleet] legacy orchestrator not found at ${LEGACY_ORCHESTRATOR}.\n`);
        return 1;
    }
    try {
        // /usr/bin/env is absent in the Nix image; invoke bash via PATH.
        execFileSync('bash', [LEGACY_ORCHESTRATOR, ...argv], { stdio: 'inherit' });
        return 0;
    }
    catch (err) {
        const code = err.status;
        return typeof code === 'number' ? code : 1;
    }
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
export async function run(argv) {
    const o = parseArgs(argv);
    if (o.help) {
        process.stdout.write(HELP);
        return 0;
    }
    if (o.version) {
        process.stdout.write(`${VERSION}\n`);
        return 0;
    }
    if (o.legacy) {
        return bridgeToLegacy(argv);
    }
    // Native status / dry-run need the tasks file.
    if (o.status || o.dryRun) {
        if (!existsSync(o.tasks)) {
            process.stderr.write(`tasks file not found: ${o.tasks}\n`);
            return 2;
        }
        const tasks = loadTasksJson(o.tasks).tasks;
        const board = await new Ledger(o.ledger).replay();
        if (o.status) {
            const c = countsFor(tasks, board);
            process.stdout.write(`taskfleet status — ${tasks.length} tasks\n` +
                Object.entries(c)
                    .map(([k, v]) => `  ${k}: ${v}`)
                    .join('\n') +
                '\n');
            return 0;
        }
        const running = new Set([...board.status.entries()]
            .filter(([, s]) => s === 'running' || s === 'verifying')
            .map(([id]) => id));
        const ready = selectReady(tasks, board, running);
        process.stdout.write(`dry-run dispatch plan (${ready.length} ready):\n` +
            ready.map((id) => `  → ${id}`).join('\n') +
            '\n');
        return 0;
    }
    // Native dispatch loop (the v2 engine).
    if (!existsSync(o.tasks)) {
        process.stderr.write(`tasks file not found: ${o.tasks}\n`);
        return 2;
    }
    const tasks = loadTasksJson(o.tasks).tasks;
    const workers = existsSync(o.workers) ? loadWorkersJson(o.workers) : [];
    const repoDir = process.env.TF_REPO_DIR ?? '/repo';
    const ledger = new Ledger(o.ledger);
    const ctx = {
        tasks,
        workers,
        ledger,
        repoDir,
        maxParallel: Number(process.env.TF_MAX_PARALLEL ?? 2),
        requireReview: process.env.TF_REQUIRE_REVIEW === '1',
        onlyTask: o.task,
    };
    if (o.poll && o.poll > 0) {
        for (;;) {
            const results = await runLoop(ctx, { rounds: 0 });
            process.stdout.write(summarize(results) + '\n');
            await sleep(o.poll * 1000);
        }
    }
    const results = await runLoop(ctx, { rounds: 0 });
    process.stdout.write(summarize(results) + '\n');
    return 0;
}
// Execute when run as the bin (not when imported by tests).
// Symlink-safe: /opt/taskfleet-core is a symlink into the nix store, so
// import.meta.url (resolved) must be realpath-compared against argv[1].
function isBinEntry() {
    if (!import.meta.url.startsWith('file://'))
        return false;
    try {
        const self = realpathSync(fileURLToPath(import.meta.url));
        const invoked = process.argv[1] ? realpathSync(process.argv[1]) : '';
        return self === invoked;
    }
    catch {
        return false;
    }
}
if (isBinEntry()) {
    run(process.argv.slice(2))
        .then((code) => process.exit(code))
        .catch((err) => {
        process.stderr.write(String(err?.stack ?? err) + '\n');
        process.exit(1);
    });
}
