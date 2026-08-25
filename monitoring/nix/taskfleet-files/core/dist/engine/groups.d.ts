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
import { Task, TaskStatus } from '../types.js';
export declare const MissionSchema: z.ZodObject<{
    id: z.ZodString;
    goal: z.ZodString;
    tasks: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    parent: z.ZodOptional<z.ZodString>;
    acceptance_prose: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    tasks: string[];
    goal: string;
    acceptance_prose?: string | undefined;
    parent?: string | undefined;
}, {
    id: string;
    goal: string;
    acceptance_prose?: string | undefined;
    tasks?: string[] | undefined;
    parent?: string | undefined;
}>;
export type Mission = z.infer<typeof MissionSchema>;
export declare const MissionsFileSchema: z.ZodObject<{
    _meta: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    missions: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        goal: z.ZodString;
        tasks: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        parent: z.ZodOptional<z.ZodString>;
        acceptance_prose: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        tasks: string[];
        goal: string;
        acceptance_prose?: string | undefined;
        parent?: string | undefined;
    }, {
        id: string;
        goal: string;
        acceptance_prose?: string | undefined;
        tasks?: string[] | undefined;
        parent?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    missions: {
        id: string;
        tasks: string[];
        goal: string;
        acceptance_prose?: string | undefined;
        parent?: string | undefined;
    }[];
    _meta?: Record<string, unknown> | undefined;
}, {
    missions: {
        id: string;
        goal: string;
        acceptance_prose?: string | undefined;
        tasks?: string[] | undefined;
        parent?: string | undefined;
    }[];
    _meta?: Record<string, unknown> | undefined;
}>;
export type MissionsFile = z.infer<typeof MissionsFileSchema>;
export declare const MISSION_INIT_PREFIX = "__mission_";
export declare const MISSION_INIT_SUFFIX = "_init";
export declare function missionInitId(missionId: string): string;
/** Which mission directly owns a task (if any). */
export declare function missionOfTask(taskId: string, missions: readonly Mission[]): string | undefined;
export declare function childMissions(parentId: string, missions: readonly Mission[]): Mission[];
/**
 * Expand missions into synthetic init gate tasks + extra dependency edges.
 * Each real task in a mission depends on its mission init; each mission init
 * depends on its parent mission init. Returns init tasks to merge into the
 * scheduler's task list and the extra deps to attach.
 */
export declare function expandMissions(missions: readonly Mission[]): {
    initTasks: Task[];
    extraDeps: Map<string, string[]>;
};
/** Merge extra mission deps into a task's existing deps (deduped). */
export declare function withMissionDeps(task: Task, extraDeps: Map<string, string[]>): Task;
/**
 * A mission is complete iff all its tasks are done AND all child missions are
 * complete (recursive).
 */
export declare function missionComplete(missionId: string, missions: readonly Mission[], status: ReadonlyMap<string, TaskStatus>): boolean;
export type MissionState = 'ready' | 'in_progress' | 'done' | 'blocked';
/**
 * Mission lifecycle state:
 *  - done:    all tasks + child missions complete
 *  - blocked: parent mission not yet complete
 *  - in_progress / ready: parent complete, work remaining
 */
export declare function missionState(missionId: string, missions: readonly Mission[], status: ReadonlyMap<string, TaskStatus>): MissionState;
export declare function allMissionsComplete(missions: readonly Mission[], status: ReadonlyMap<string, TaskStatus>): boolean;
