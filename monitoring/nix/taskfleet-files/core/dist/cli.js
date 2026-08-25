/**
 * cli.ts — taskfleet v2 command router.
 *
 * Container-ready: config defaults come from TF_CONFIG_DIR (set in the Nix
 * image + compose), the ledger path from TF_STATE_DIR, and `--version` is
 * available. Native commands (--help/--status/--dry-run) are implemented here;
 * `--once`/run currently bridges to the legacy bash orchestrator
 * (/opt/taskfleet/orchestrator.sh) so production keeps working until the
 * native dispatch loop lands. The bridge is removed once the loop exists.
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Ledger } from './engine/ledger.js';
import { counts } from './engine/board.js';
import { selectReady } from './engine/scheduler.js';
import { loadTasksJson } from './config.js';
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
  taskfleet --once            (bridges to legacy orchestrator until native loop lands)

Options:
  --tasks FILE     tasks.json path        (default: $TF_CONFIG_DIR/tasks.json or config/tasks.json)
  --workers FILE   workers.json path      (default: $TF_CONFIG_DIR/workers.json or config/workers.json)
  --ledger FILE    NDJSON event log path  (default: $TF_STATE_DIR/ledger.ndjson)
  --dry-run        show dispatch plan, change nothing
  --status         print status board and exit
  --once           dispatch one round then exit
  --version        print version and exit
`;
/** Transitional: hand a run request to the legacy bash orchestrator. */
function bridgeToLegacy(argv) {
    if (!existsSync(LEGACY_ORCHESTRATOR)) {
        process.stderr.write(`[taskfleet] legacy orchestrator not found at ${LEGACY_ORCHESTRATOR}; ` +
            `native dispatch loop not yet implemented.\n`);
        return 1;
    }
    // Invoke via `bash` (on PATH) rather than relying on the script's
    // #!/usr/bin/env shebang — /usr/bin/env is absent from the Nix image.
    try {
        execFileSync('bash', [LEGACY_ORCHESTRATOR, ...argv], { stdio: 'inherit' });
        return 0;
    }
    catch (err) {
        const code = err.status;
        return typeof code === 'number' ? code : 1;
    }
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
    // Native commands need the tasks file.
    if (o.status || o.dryRun) {
        if (!existsSync(o.tasks)) {
            process.stderr.write(`tasks file not found: ${o.tasks}\n`);
            return 2;
        }
        const tasks = loadTasksJson(o.tasks).tasks;
        const board = await new Ledger(o.ledger).replay();
        if (o.status) {
            const c = counts(board);
            process.stdout.write(`taskfleet status — ${tasks.length} tasks\n` +
                Object.entries(c)
                    .map(([k, v]) => `  ${k}: ${v}`)
                    .join('\n') +
                '\n');
            return 0;
        }
        // dry-run
        const running = new Set([...board.status.entries()]
            .filter(([, s]) => s === 'running' || s === 'verifying')
            .map(([id]) => id));
        const ready = selectReady(tasks, board, running);
        process.stdout.write(`dry-run dispatch plan (${ready.length} ready):\n` +
            ready.map((id) => `  → ${id}`).join('\n') +
            '\n');
        return 0;
    }
    // --once / --task / --worker / --poll / default → legacy bridge (transitional)
    return bridgeToLegacy(argv);
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
