/**
 * types.ts — shared domain types and zod schemas for taskfleet v2.
 *
 * Backward-compatible with the v1 tasks.json / workers.json shapes; new fields
 * default safely so existing configs keep working.
 */
import { z } from 'zod';
export const ModelTier = z.enum(['booster', 'fast', 'standard', 'deep']);
export const TaskStatus = z.enum([
    'ready',
    'running',
    'verifying',
    'pending_review',
    'done',
    'failed',
    'blocked',
]);
export const TaskSchema = z.object({
    id: z.string().min(1),
    title: z.string(),
    deps: z.array(z.string()).default([]),
    scope: z.array(z.string()).default([]),
    accept: z.string().optional(),
    acceptance_prose: z.string().optional(),
    manual: z.boolean().default(false),
    model_tier: ModelTier.default('standard'),
    repo: z.string().default(''),
    source: z.string().optional(),
});
export const WorkerSchema = z.object({
    name: z.string().min(1),
    enabled: z.boolean().default(true),
    provider: z.string(),
    model: z.string(),
    api_base: z.string().optional(),
    tiers: z.array(ModelTier).optional(),
});
export const TasksFileSchema = z.object({
    _meta: z.record(z.string(), z.unknown()).optional(),
    tasks: z.array(TaskSchema),
});
export const WorkersFileSchema = z.object({
    defaults: z.record(z.string(), z.unknown()).optional(),
    workers: z.array(WorkerSchema),
});
/** Trust bucket computed by trust.ts. */
export const TrustBucket = z.enum(['trusted', 'review', 'blocked']);
export function isTaskEvent(x) {
    return (typeof x === 'object' &&
        x !== null &&
        typeof x.type === 'string' &&
        x.type.startsWith('task:'));
}
