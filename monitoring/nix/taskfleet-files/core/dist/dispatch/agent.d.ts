import { Worker } from '../types.js';
export type AgentExec = (cmd: string, args: string[], opts?: {
    cwd?: string;
}) => Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
}>;
export declare const defaultAgentExec: AgentExec;
/** Pure builder: agent CLI argv for a given worker + prompt file. */
export declare function buildAgentArgs(worker: Worker, promptFile: string): string[];
export interface DispatchResult {
    exitCode: number;
    stdout: string;
    stderr: string;
}
export declare function dispatchAgent(cliCmd: string, worker: Worker, promptFile: string, exec?: AgentExec, cwd?: string): Promise<DispatchResult>;
