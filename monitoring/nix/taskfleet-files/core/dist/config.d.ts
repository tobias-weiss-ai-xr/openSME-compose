import { ModelTier, Task, TasksFile, Worker } from './types.js';
export declare function loadTasksJson(path: string): TasksFile;
export declare function loadWorkersJson(path: string): Worker[];
export declare function taskList(path: string): Task[];
/** Workers that are enabled and can serve a given model tier. */
export declare function workersForTier(workers: readonly Worker[], tier: ModelTier | string): Worker[];
