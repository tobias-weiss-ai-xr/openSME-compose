/**
 * worktree.ts — git worktree isolation (create / merge / remove).
 *
 * Command construction is pure & exported for testing; execution goes through a
 * single `runGit` seam (default: child_process.execFile) so tests can inject a
 * fake. Mirrors v1's per-task branch + working tree, now provider-agnostic.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileP = promisify(execFile);
export const defaultGitExec = (file, args) => execFileP(file, args, { maxBuffer: 64 * 1024 * 1024 });
// ---------------------------------------------------------------------------
// Pure command builders (exported for unit tests)
// ---------------------------------------------------------------------------
export function cmdWorktreeAdd(branch, base, path) {
    return ['worktree', 'add', '--force', '--track', '-b', branch, path, base];
}
export function cmdMerge(branch) {
    return ['merge', '--no-ff', '--no-edit', branch];
}
export function cmdRemove(path) {
    return ['worktree', 'remove', '--force', path];
}
export function cmdPrune() {
    return ['worktree', 'prune'];
}
export function cmdDiffNames(base) {
    return ['diff', '--name-only', `${base}...HEAD`];
}
// ---------------------------------------------------------------------------
// Executor wrappers
// ---------------------------------------------------------------------------
export class WorktreeManager {
    repoDir;
    git;
    constructor(repoDir, git = defaultGitExec) {
        this.repoDir = repoDir;
        this.git = git;
    }
    run(args) {
        return this.git('git', ['-C', this.repoDir, ...args]);
    }
    async add(branch, base, path) {
        await this.run(cmdWorktreeAdd(branch, base, path));
    }
    async merge(branch) {
        await this.run(cmdMerge(branch));
    }
    async remove(path) {
        await this.run(cmdRemove(path));
        await this.run(cmdPrune());
    }
    async changedFiles(base) {
        const { stdout } = await this.run(cmdDiffNames(base));
        return stdout
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean);
    }
}
