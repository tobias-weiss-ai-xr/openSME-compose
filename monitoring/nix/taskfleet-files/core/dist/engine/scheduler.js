import { criticalPathDepth, readyTaskIds } from './board.js';
/** True if `a` and `b` share at least one scope glob. */
export function scopesOverlap(a, b) {
    for (const f of a.scope) {
        if (b.scope.includes(f))
            return true;
    }
    return false;
}
/**
 * Select the next task ids to dispatch: ready (deps done) AND not in scope
 * contention with any currently-running task. Sorted by critical-path depth
 * descending, then id for determinism.
 */
export function selectReady(tasks, board, runningIds, opts = {}) {
    const policy = opts.contentionPolicy ?? 'defer';
    const ready = readyTaskIds(tasks, board);
    const readySet = new Set(ready);
    const runningTasks = tasks.filter((t) => runningIds.has(t.id) && !readySet.has(t.id));
    const depth = criticalPathDepth(tasks);
    const out = [];
    for (const id of ready) {
        const task = tasks.find((t) => t.id === id);
        if (!task)
            continue;
        if (policy === 'defer') {
            const conflicts = runningTasks.some((r) => scopesOverlap(task, r));
            if (conflicts)
                continue;
        }
        out.push(id);
    }
    return out.sort((a, b) => {
        const da = depth.get(a) ?? 0;
        const db = depth.get(b) ?? 0;
        if (db !== da)
            return db - da;
        return a < b ? -1 : a > b ? 1 : 0;
    });
}
