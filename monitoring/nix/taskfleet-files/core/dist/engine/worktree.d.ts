export type GitExec = (file: string, args: string[]) => Promise<{
    stdout: string;
    stderr: string;
}>;
export declare const defaultGitExec: GitExec;
export declare function cmdWorktreeAdd(branch: string, base: string, path: string): string[];
export declare function cmdMerge(branch: string): string[];
export declare function cmdRemove(path: string): string[];
export declare function cmdPrune(): string[];
export declare function cmdDiffNames(base: string): string[];
export declare class WorktreeManager {
    private readonly repoDir;
    private readonly git;
    constructor(repoDir: string, git?: GitExec);
    private run;
    add(branch: string, base: string, path: string): Promise<void>;
    merge(branch: string): Promise<void>;
    remove(path: string): Promise<void>;
    changedFiles(base: string): Promise<string[]>;
}
