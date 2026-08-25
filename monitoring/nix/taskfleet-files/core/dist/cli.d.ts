export interface CliOptions {
    tasks: string;
    workers: string;
    ledger: string;
    worker?: string;
    task?: string;
    dryRun: boolean;
    once: boolean;
    loop: boolean;
    legacy: boolean;
    poll?: number;
    status: boolean;
    version: boolean;
    help: boolean;
}
export declare function parseArgs(argv: string[]): CliOptions;
export declare const HELP = "taskfleet v2 \u2014 governed, adaptive agent orchestration\n\nUsage:\n  taskfleet --help\n  taskfleet --version\n  taskfleet --status\n  taskfleet --dry-run [--tasks FILE] [--workers FILE] [--ledger FILE]\n  taskfleet [--once|--loop] [--tasks FILE] [--workers FILE] [--ledger FILE]\n  taskfleet --poll N            (run to completion, sleep N sec, repeat)\n  taskfleet --legacy [ARGS]     (delegate to legacy bash orchestrator)\n\nOptions:\n  --tasks FILE     tasks.json path        (default: $TF_CONFIG_DIR/tasks.json or config/tasks.json)\n  --workers FILE   workers.json path      (default: $TF_CONFIG_DIR/workers.json or config/workers.json)\n  --ledger FILE    NDJSON event log path  (default: $TF_STATE_DIR/ledger.ndjson)\n  --task ID        dispatch only this task\n  --dry-run        show dispatch plan, change nothing\n  --status         print status board and exit\n  --once           run the native loop to completion, then exit\n  --loop           alias for --once\n  --poll N         repeat the loop every N seconds\n  --legacy         bridge to /opt/taskfleet/orchestrator.sh\n  --version        print version and exit\n";
export declare function run(argv: string[]): Promise<number>;
