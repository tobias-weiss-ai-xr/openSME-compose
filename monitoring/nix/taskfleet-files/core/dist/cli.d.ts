export interface CliOptions {
    tasks: string;
    workers: string;
    ledger: string;
    worker?: string;
    task?: string;
    dryRun: boolean;
    once: boolean;
    status: boolean;
    version: boolean;
    help: boolean;
}
export declare function parseArgs(argv: string[]): CliOptions;
export declare const HELP = "taskfleet v2 \u2014 governed, adaptive agent orchestration\n\nUsage:\n  taskfleet --help\n  taskfleet --version\n  taskfleet --status\n  taskfleet --dry-run [--tasks FILE] [--workers FILE] [--ledger FILE]\n  taskfleet --once            (bridges to legacy orchestrator until native loop lands)\n\nOptions:\n  --tasks FILE     tasks.json path        (default: $TF_CONFIG_DIR/tasks.json or config/tasks.json)\n  --workers FILE   workers.json path      (default: $TF_CONFIG_DIR/workers.json or config/workers.json)\n  --ledger FILE    NDJSON event log path  (default: $TF_STATE_DIR/ledger.ndjson)\n  --dry-run        show dispatch plan, change nothing\n  --status         print status board and exit\n  --once           dispatch one round then exit\n  --version        print version and exit\n";
export declare function run(argv: string[]): Promise<number>;
