/**
 * ledger.ts — append-only NDJSON event log + state fold.
 *
 * This is the unifying primitive of taskfleet v2 (event sourcing). The current
 * board state is always `fold(events)`; crashing and replaying the log restores
 * exactly where we were. No native deps → safe inside the Nix image.
 */
import { promises as fs, appendFileSync, existsSync } from 'node:fs';
import { isTaskEvent, } from '../types.js';
/** Append one event as a single NDJSON line (atomic per-line for single writer). */
export async function appendEvent(path, ev) {
    await fs.appendFile(path, JSON.stringify(ev) + '\n', 'utf8');
}
/** Synchronously append (hot path inside a dispatch loop). */
export function appendEventSync(path, ev) {
    appendFileSync(path, JSON.stringify(ev) + '\n', 'utf8');
}
/** Read + parse all events from a ledger file (empty array if missing). */
export async function loadEvents(path) {
    if (!existsSync(path))
        return [];
    const raw = await fs.readFile(path, 'utf8');
    const out = [];
    for (const line of raw.split('\n')) {
        const t = line.trim();
        if (!t)
            continue;
        try {
            const parsed = JSON.parse(t);
            if (isTaskEvent(parsed))
                out.push(parsed);
        }
        catch {
            // Skip corrupt lines (chaos tolerance); never crash on replay.
        }
    }
    return out;
}
/** Pure fold: events → board state. Deterministic, idempotent. */
export function deriveBoard(events) {
    const status = new Map();
    for (const ev of events) {
        switch (ev.type) {
            case 'task:created':
                status.set(ev.id, 'ready');
                break;
            case 'task:dispatch':
                status.set(ev.id, 'running');
                break;
            case 'task:gate':
                status.set(ev.id, ev.pass ? 'verifying' : 'running');
                break;
            case 'task:trust':
                if (ev.bucket === 'trusted')
                    status.set(ev.id, 'verifying');
                else if (ev.bucket === 'blocked')
                    status.set(ev.id, 'failed');
                else
                    status.set(ev.id, 'pending_review');
                break;
            case 'task:approval:request':
                status.set(ev.id, 'pending_review');
                break;
            case 'task:approval:grant':
                status.set(ev.id, 'verifying');
                break;
            case 'task:approval:deny':
                status.set(ev.id, 'failed');
                break;
            case 'task:retry':
                status.set(ev.id, 'ready');
                break;
            case 'task:merge':
            case 'task:done':
                status.set(ev.id, 'done');
                break;
            case 'task:failed':
                status.set(ev.id, 'failed');
                break;
        }
    }
    return { status, events: events.slice() };
}
/** A thin file-backed ledger with replay and direct queries. */
export class Ledger {
    path;
    constructor(path) {
        this.path = path;
    }
    async append(ev) {
        await appendEvent(this.path, ev);
    }
    appendSync(ev) {
        appendEventSync(this.path, ev);
    }
    async replay() {
        const events = await loadEvents(this.path);
        return deriveBoard(events);
    }
    async statusOf(id) {
        const board = await this.replay();
        return board.status.get(id);
    }
    async events() {
        return loadEvents(this.path);
    }
    /** All task ids that ever appeared, in first-seen order. */
    async taskIds() {
        const seen = new Set();
        const order = [];
        for (const ev of await loadEvents(this.path)) {
            if (ev.type === 'task:created' && !seen.has(ev.id)) {
                seen.add(ev.id);
                order.push(ev.id);
            }
        }
        return order;
    }
}
