/**
 * board.ts — task status-machine helpers derived from the ledger.
 *
 * Pure functions over (tasks, boardState). No I/O here so it is trivially
 * unit- and property-testable.
 */
import { BoardState, Task, TaskStatus } from '../types.js';
/** A task is "ready" iff status===ready AND all deps are done. */
export declare function isReady(task: Task, status: Map<string, TaskStatus>, allIds: Set<string>): boolean;
export declare function readyTaskIds(tasks: readonly Task[], board: BoardState): string[];
export declare function statusOf(board: BoardState, id: string): TaskStatus | undefined;
export declare function counts(board: BoardState): Record<TaskStatus, number>;
/**
 * Critical-path depth: longest dependency chain to a leaf.
 * Leaf (no dependents) → depth 0; deeper tasks get higher depth.
 * Used by the scheduler to prioritize critical-path work.
 */
export declare function criticalPathDepth(tasks: readonly Task[]): Map<string, number>;
