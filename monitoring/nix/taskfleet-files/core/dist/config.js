/**
 * config.ts — load + validate tasks.json / workers.json (v1 schema preserved).
 *
 * New optional fields (model_tier, repo, source) default safely, so the existing
 * config/ files in this repo keep working unchanged.
 */
import { readFileSync } from 'node:fs';
import { TasksFileSchema, WorkersFileSchema, } from './types.js';
export function loadTasksJson(path) {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    return TasksFileSchema.parse(raw);
}
export function loadWorkersJson(path) {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    const parsed = WorkersFileSchema.parse(raw);
    return parsed.workers;
}
export function taskList(path) {
    return loadTasksJson(path).tasks;
}
/** Workers that are enabled and can serve a given model tier. */
export function workersForTier(workers, tier) {
    return workers.filter((w) => {
        if (!w.enabled)
            return false;
        if (!w.tiers)
            return true; // no tiers declared → can run anything
        return w.tiers.includes(tier);
    });
}
