/**
 * types.ts — shared domain types and zod schemas for taskfleet v2.
 *
 * Backward-compatible with the v1 tasks.json / workers.json shapes; new fields
 * default safely so existing configs keep working.
 */
import { z } from 'zod';
export declare const ModelTier: z.ZodEnum<["booster", "fast", "standard", "deep"]>;
export type ModelTier = z.infer<typeof ModelTier>;
export declare const TaskStatus: z.ZodEnum<["ready", "running", "verifying", "pending_review", "done", "failed", "blocked"]>;
export type TaskStatus = z.infer<typeof TaskStatus>;
export declare const TaskSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    deps: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    scope: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    accept: z.ZodOptional<z.ZodString>;
    acceptance_prose: z.ZodOptional<z.ZodString>;
    manual: z.ZodDefault<z.ZodBoolean>;
    model_tier: z.ZodDefault<z.ZodEnum<["booster", "fast", "standard", "deep"]>>;
    repo: z.ZodDefault<z.ZodString>;
    source: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    title: string;
    deps: string[];
    scope: string[];
    manual: boolean;
    model_tier: "booster" | "fast" | "standard" | "deep";
    repo: string;
    accept?: string | undefined;
    acceptance_prose?: string | undefined;
    source?: string | undefined;
}, {
    id: string;
    title: string;
    deps?: string[] | undefined;
    scope?: string[] | undefined;
    accept?: string | undefined;
    acceptance_prose?: string | undefined;
    manual?: boolean | undefined;
    model_tier?: "booster" | "fast" | "standard" | "deep" | undefined;
    repo?: string | undefined;
    source?: string | undefined;
}>;
export type Task = z.infer<typeof TaskSchema>;
export declare const WorkerSchema: z.ZodObject<{
    name: z.ZodString;
    enabled: z.ZodDefault<z.ZodBoolean>;
    provider: z.ZodString;
    model: z.ZodString;
    api_base: z.ZodOptional<z.ZodString>;
    tiers: z.ZodOptional<z.ZodArray<z.ZodEnum<["booster", "fast", "standard", "deep"]>, "many">>;
}, "strip", z.ZodTypeAny, {
    name: string;
    enabled: boolean;
    provider: string;
    model: string;
    api_base?: string | undefined;
    tiers?: ("booster" | "fast" | "standard" | "deep")[] | undefined;
}, {
    name: string;
    provider: string;
    model: string;
    enabled?: boolean | undefined;
    api_base?: string | undefined;
    tiers?: ("booster" | "fast" | "standard" | "deep")[] | undefined;
}>;
export type Worker = z.infer<typeof WorkerSchema>;
export declare const TasksFileSchema: z.ZodObject<{
    _meta: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    tasks: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        deps: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        scope: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        accept: z.ZodOptional<z.ZodString>;
        acceptance_prose: z.ZodOptional<z.ZodString>;
        manual: z.ZodDefault<z.ZodBoolean>;
        model_tier: z.ZodDefault<z.ZodEnum<["booster", "fast", "standard", "deep"]>>;
        repo: z.ZodDefault<z.ZodString>;
        source: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        title: string;
        deps: string[];
        scope: string[];
        manual: boolean;
        model_tier: "booster" | "fast" | "standard" | "deep";
        repo: string;
        accept?: string | undefined;
        acceptance_prose?: string | undefined;
        source?: string | undefined;
    }, {
        id: string;
        title: string;
        deps?: string[] | undefined;
        scope?: string[] | undefined;
        accept?: string | undefined;
        acceptance_prose?: string | undefined;
        manual?: boolean | undefined;
        model_tier?: "booster" | "fast" | "standard" | "deep" | undefined;
        repo?: string | undefined;
        source?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    tasks: {
        id: string;
        title: string;
        deps: string[];
        scope: string[];
        manual: boolean;
        model_tier: "booster" | "fast" | "standard" | "deep";
        repo: string;
        accept?: string | undefined;
        acceptance_prose?: string | undefined;
        source?: string | undefined;
    }[];
    _meta?: Record<string, unknown> | undefined;
}, {
    tasks: {
        id: string;
        title: string;
        deps?: string[] | undefined;
        scope?: string[] | undefined;
        accept?: string | undefined;
        acceptance_prose?: string | undefined;
        manual?: boolean | undefined;
        model_tier?: "booster" | "fast" | "standard" | "deep" | undefined;
        repo?: string | undefined;
        source?: string | undefined;
    }[];
    _meta?: Record<string, unknown> | undefined;
}>;
export type TasksFile = z.infer<typeof TasksFileSchema>;
export declare const WorkersFileSchema: z.ZodObject<{
    defaults: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    workers: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        enabled: z.ZodDefault<z.ZodBoolean>;
        provider: z.ZodString;
        model: z.ZodString;
        api_base: z.ZodOptional<z.ZodString>;
        tiers: z.ZodOptional<z.ZodArray<z.ZodEnum<["booster", "fast", "standard", "deep"]>, "many">>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        enabled: boolean;
        provider: string;
        model: string;
        api_base?: string | undefined;
        tiers?: ("booster" | "fast" | "standard" | "deep")[] | undefined;
    }, {
        name: string;
        provider: string;
        model: string;
        enabled?: boolean | undefined;
        api_base?: string | undefined;
        tiers?: ("booster" | "fast" | "standard" | "deep")[] | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    workers: {
        name: string;
        enabled: boolean;
        provider: string;
        model: string;
        api_base?: string | undefined;
        tiers?: ("booster" | "fast" | "standard" | "deep")[] | undefined;
    }[];
    defaults?: Record<string, unknown> | undefined;
}, {
    workers: {
        name: string;
        provider: string;
        model: string;
        enabled?: boolean | undefined;
        api_base?: string | undefined;
        tiers?: ("booster" | "fast" | "standard" | "deep")[] | undefined;
    }[];
    defaults?: Record<string, unknown> | undefined;
}>;
export type WorkersFile = z.infer<typeof WorkersFileSchema>;
/** Trust bucket computed by trust.ts. */
export declare const TrustBucket: z.ZodEnum<["trusted", "review", "blocked"]>;
export type TrustBucket = z.infer<typeof TrustBucket>;
/**
 * The append-only ledger event union. Every state change is one of these.
 * `ts` is epoch milliseconds. Stable ordinals matter for replay determinism.
 */
export type TaskEvent = {
    type: 'task:created';
    id: string;
    ts: number;
    task: Task;
} | {
    type: 'task:dispatch';
    id: string;
    ts: number;
    worker: string;
    attempt: number;
} | {
    type: 'task:gate';
    id: string;
    ts: number;
    pass: boolean;
    exitCode: number;
} | {
    type: 'task:trust';
    id: string;
    ts: number;
    score: number;
    bucket: TrustBucket;
} | {
    type: 'task:retry';
    id: string;
    ts: number;
    attempt: number;
    reason: string;
} | {
    type: 'task:merge';
    id: string;
    ts: number;
} | {
    type: 'task:approval:request';
    id: string;
    ts: number;
} | {
    type: 'task:approval:grant';
    id: string;
    ts: number;
} | {
    type: 'task:approval:deny';
    id: string;
    ts: number;
    reason?: string;
} | {
    type: 'task:done';
    id: string;
    ts: number;
} | {
    type: 'task:failed';
    id: string;
    ts: number;
    reason?: string;
};
export declare function isTaskEvent(x: unknown): x is TaskEvent;
export interface BoardState {
    /** Derived status per task id. */
    status: Map<string, TaskStatus>;
    /** Append-only event log, in order. */
    events: TaskEvent[];
}
