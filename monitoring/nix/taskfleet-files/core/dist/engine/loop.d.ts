import { BoardState, Task, TaskEvent, Worker } from '../types.js';
import { Ledger } from './ledger.js';
import { GitExec } from './worktree.js';
import { AgentExec } from '../dispatch/agent.js';
import { GateExec } from './verify.js';
export declare const defaultAgentExec: AgentExec;
export declare const defaultGitExec: GitExec;
export declare const defaultGateExec: GateExec;
export interface DispatchContext {
    tasks: Task[];
    workers: Worker[];
    ledger: Ledger;
    repoDir: string;
    /** Agent CLI binary (default: $TF_AGENT_CMD or "pi"). */
    cliCmd?: string;
    agentExec?: AgentExec;
    gitExec?: GitExec;
    gateExec?: GateExec;
    /** Independent reviewer approval (default: auto-approve). */
    reviewApproved?: () => Promise<boolean>;
    maxParallel?: number;
    requireReview?: boolean;
    reviewThreshold?: number;
    trustThreshold?: number;
    maxRetries?: number;
    promptsDir?: string;
    /** Base branch the worktree forked from (default "main"). */
    baseBranch?: string;
    /** Restrict dispatch to a single task id (v1 --task). */
    onlyTask?: string;
}
export interface RoundOutcome {
    dispatched: string[];
    completed: string[];
    pendingReview: string[];
    failed: string[];
    retried: string[];
    events: TaskEvent[];
}
/** Pick a worker for a task: first enabled worker serving its tier, else any. */
export declare function pickWorker(workers: readonly Worker[], task: Task): Worker | undefined;
export declare function retryCount(events: readonly TaskEvent[], id: string): number;
/** Fraction of changed files that lie within declared scope, 0..1. */
export declare function scopeAdherence(changed: string[], scope: string[]): number;
export declare function buildPrompt(task: Task): string;
export declare function runRound(ctxIn: DispatchContext, board: BoardState): Promise<RoundOutcome>;
export interface LoopOptions {
    /**
     * Maximum number of rounds. 0 (default) means run until a round dispatches
     * nothing — i.e. until the board is quiescent.
     */
    rounds?: number;
}
export declare function runLoop(ctxIn: DispatchContext, opts?: LoopOptions): Promise<RoundOutcome[]>;
/** Compact human summary of a loop run (for CLI output). */
export declare function summarize(rounds: readonly RoundOutcome[]): string;
