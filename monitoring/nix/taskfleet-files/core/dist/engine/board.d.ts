/**
 * board.ts — task status-machine helpers derived from the ledger.
 *
 * Pure functions over (tasks, boardState). No I/O here so it is trivially
 * unit- and property-testable.
 */
import { BoardState, Task, TaskStatus } from '../types.js';
/**
 * A task is "ready" iff it is not in an explicit non-ready state AND all deps
 * are done. An unseen task (no ledger event yet) defaults to ready — the
 * scheduler drives initial work from tasks.json, and the ledger is seeded with
 * task:created events at loop start.
 */
export declare function isReady(task: Task, status: Map<string, TaskStatus>, allIds: Set<string>): boolean;
export declare function readyTaskIds(tasks: readonly Task[], board: BoardState): string[];
export declare function statusOf(board: BoardState, id: string): TaskStatus | undefined;
/**
 * Status map covering every task id. Tasks with no ledger event yet default to
 * `ready`, so counts/status reflect the full tasks.json even before seeding.
 */
export declare function expandStatus(tasks: readonly Task[], board: BoardState): Map<string, TaskStatus>;
/** Counts over the full task list (unseen tasks counted as ready). */
export declare function countsFor(tasks: readonly Task[], board: BoardState): Record<TaskStatus, number>;
export declare function counts(board: BoardState): Record<TaskStatus, number>;
/**
 * Critical-path depth: longest dependency chain to a leaf.
 * Leaf (no dependents) → depth 0; deeper tasks get higher depth.
 * Used by the scheduler to prioritize critical-path work.
 */
export declare function criticalPathDepth(tasks: readonly Task[]): Map<string, number>;
