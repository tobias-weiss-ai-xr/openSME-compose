import { BoardState, TaskEvent, TaskStatus } from '../types.js';
/** Append one event as a single NDJSON line (atomic per-line for single writer). */
export declare function appendEvent(path: string, ev: TaskEvent): Promise<void>;
/** Synchronously append (hot path inside a dispatch loop). */
export declare function appendEventSync(path: string, ev: TaskEvent): void;
/** Read + parse all events from a ledger file (empty array if missing). */
export declare function loadEvents(path: string): Promise<TaskEvent[]>;
/** Pure fold: events → board state. Deterministic, idempotent. */
export declare function deriveBoard(events: readonly TaskEvent[]): BoardState;
/** A thin file-backed ledger with replay and direct queries. */
export declare class Ledger {
    readonly path: string;
    constructor(path: string);
    append(ev: TaskEvent): Promise<void>;
    appendSync(ev: TaskEvent): void;
    replay(): Promise<BoardState>;
    statusOf(id: string): Promise<TaskStatus | undefined>;
    events(): Promise<TaskEvent[]>;
    /** All task ids that ever appeared, in first-seen order. */
    taskIds(): Promise<string[]>;
}
