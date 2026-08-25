/**
 * groups.ts — hierarchical missions (the "hierarchical planning" angle from
 * c2-ai + robotics corpora).
 *
 * v1 runs a flat `deps` DAG. v2 adds a *mission* layer: a goal decomposes into
 * sub-tasks (and optionally nested sub-missions). Recursive orchestration falls
 * out naturally — when every child task (and child mission) is done, the
 * mission is complete, and its parent may proceed.
 *
 * Missions are expanded into synthetic `__mission_<id>_init` gate tasks so the
 * existing scheduler DAG machinery handles them with zero special-casing.
 */
import { z } from 'zod';
export const MissionSchema = z.object({
    id: z.string().min(1),
    goal: z.string(),
    tasks: z.array(z.string()).default([]),
    parent: z.string().optional(),
    acceptance_prose: z.string().optional(),
});
export const MissionsFileSchema = z.object({
    _meta: z.record(z.string(), z.unknown()).optional(),
    missions: z.array(MissionSchema),
});
export const MISSION_INIT_PREFIX = '__mission_';
export const MISSION_INIT_SUFFIX = '_init';
export function missionInitId(missionId) {
    return `${MISSION_INIT_PREFIX}${missionId}${MISSION_INIT_SUFFIX}`;
}
/** Which mission directly owns a task (if any). */
export function missionOfTask(taskId, missions) {
    for (const m of missions)
        if (m.tasks.includes(taskId))
            return m.id;
    return undefined;
}
export function childMissions(parentId, missions) {
    return missions.filter((m) => m.parent === parentId);
}
/**
 * Expand missions into synthetic init gate tasks + extra dependency edges.
 * Each real task in a mission depends on its mission init; each mission init
 * depends on its parent mission init. Returns init tasks to merge into the
 * scheduler's task list and the extra deps to attach.
 */
export function expandMissions(missions) {
    const initTasks = [];
    const extraDeps = new Map();
    for (const m of missions) {
        const init = missionInitId(m.id);
        initTasks.push({
            id: init,
            title: `mission init: ${m.goal}`,
            deps: m.parent ? [missionInitId(m.parent)] : [],
            scope: [],
            manual: false,
            model_tier: 'standard',
            repo: '',
        });
        for (const t of m.tasks) {
            const cur = extraDeps.get(t) ?? [];
            cur.push(init);
            extraDeps.set(t, cur);
        }
    }
    return { initTasks, extraDeps };
}
/** Merge extra mission deps into a task's existing deps (deduped). */
export function withMissionDeps(task, extraDeps) {
    const extra = extraDeps.get(task.id);
    if (!extra || extra.length === 0)
        return task;
    const merged = Array.from(new Set([...task.deps, ...extra]));
    return { ...task, deps: merged };
}
/**
 * A mission is complete iff all its tasks are done AND all child missions are
 * complete (recursive).
 */
export function missionComplete(missionId, missions, status) {
    const m = missions.find((x) => x.id === missionId);
    if (!m)
        return false;
    if (!m.tasks.every((t) => status.get(t) === 'done'))
        return false;
    for (const child of childMissions(missionId, missions)) {
        if (!missionComplete(child.id, missions, status))
            return false;
    }
    return true;
}
/**
 * Mission lifecycle state:
 *  - done:    all tasks + child missions complete
 *  - blocked: parent mission not yet complete
 *  - in_progress / ready: parent complete, work remaining
 */
export function missionState(missionId, missions, status) {
    if (missionComplete(missionId, missions, status))
        return 'done';
    const m = missions.find((x) => x.id === missionId);
    if (!m)
        return 'blocked';
    if (m.parent && !missionComplete(m.parent, missions, status))
        return 'blocked';
    const remaining = m.tasks.some((t) => status.get(t) !== 'done');
    return remaining ? 'in_progress' : 'ready';
}
export function allMissionsComplete(missions, status) {
    return missions.every((m) => missionComplete(m.id, missions, status));
}
