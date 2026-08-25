/** A task is "ready" iff status===ready AND all deps are done. */
export function isReady(task, status, allIds) {
    if (status.get(task.id) !== 'ready')
        return false;
    for (const dep of task.deps) {
        // Unknown dep id is treated as not-done (defensive: malformed config).
        if (!allIds.has(dep))
            return false;
        if (status.get(dep) !== 'done')
            return false;
    }
    return true;
}
export function readyTaskIds(tasks, board) {
    const allIds = new Set(tasks.map((t) => t.id));
    return tasks
        .filter((t) => isReady(t, board.status, allIds))
        .map((t) => t.id);
}
export function statusOf(board, id) {
    return board.status.get(id);
}
export function counts(board) {
    const c = {
        ready: 0,
        running: 0,
        verifying: 0,
        pending_review: 0,
        done: 0,
        failed: 0,
        blocked: 0,
    };
    for (const s of board.status.values())
        c[s]++;
    return c;
}
/**
 * Critical-path depth: longest dependency chain to a leaf.
 * Leaf (no dependents) → depth 0; deeper tasks get higher depth.
 * Used by the scheduler to prioritize critical-path work.
 */
export function criticalPathDepth(tasks) {
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const memo = new Map();
    const visiting = new Set();
    const depth = (id) => {
        if (memo.has(id))
            return memo.get(id);
        if (visiting.has(id))
            return 0; // cycle guard
        visiting.add(id);
        const task = byId.get(id);
        let d = 0;
        if (task) {
            for (const dep of task.deps) {
                // dependency depth + 1; unknown dep treated as 0
                d = Math.max(d, depth(dep) + 1);
            }
        }
        visiting.delete(id);
        memo.set(id, d);
        return d;
    };
    const out = new Map();
    for (const t of tasks)
        out.set(t.id, depth(t.id));
    return out;
}
