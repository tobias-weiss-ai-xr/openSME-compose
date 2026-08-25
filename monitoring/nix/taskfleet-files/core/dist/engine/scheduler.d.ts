/**
 * scheduler.ts — scheduling intelligence (port of v1 lib/schedule.sh).
 *
 * Two policies from the research synthesis:
 *  - critical-path priority: deeper tasks (longer dep chains) dispatch first,
 *  - scope contention: never dispatch two tasks that touch the same files
 *    concurrently (prevents the merge-conflict class of failures).
 */
import { BoardState, Task } from '../types.js';
export type ContentionPolicy = 'defer' | 'allow';
export interface SchedulerOptions {
    contentionPolicy?: ContentionPolicy;
}
/** True if `a` and `b` share at least one scope glob. */
export declare function scopesOverlap(a: Task, b: Task): boolean;
/**
 * Select the next task ids to dispatch: ready (deps done) AND not in scope
 * contention with any currently-running task. Sorted by critical-path depth
 * descending, then id for determinism.
 */
export declare function selectReady(tasks: readonly Task[], board: BoardState, runningIds: ReadonlySet<string>, opts?: SchedulerOptions): string[];
