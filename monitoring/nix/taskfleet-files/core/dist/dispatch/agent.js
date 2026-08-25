/**
 * agent.ts — provider-agnostic agent dispatch.
 *
 * Shells out to any OpenAI-compatible agent CLI (pi, opencode, codex) via
 * subprocess. Command construction is pure + tested; execution goes through an
 * injectable seam so the orchestrator never spawns real processes in tests.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileP = promisify(execFile);
export const defaultAgentExec = (cmd, args, opts) => new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
        const exitCode = err && 'code' in err ? Number(err.code) : 0;
        if (err && exitCode !== 0) {
            resolve({ stdout, stderr, exitCode });
            return;
        }
        resolve({ stdout, stderr, exitCode });
    });
    void child;
});
/** Pure builder: agent CLI argv for a given worker + prompt file. */
export function buildAgentArgs(worker, promptFile) {
    const args = [
        '--provider',
        worker.provider,
        '--model',
        worker.model,
        '-p',
        `@${promptFile}`,
    ];
    if (worker.api_base)
        args.push('--api-base', worker.api_base);
    return args;
}
export async function dispatchAgent(cliCmd, worker, promptFile, exec = defaultAgentExec, cwd) {
    const args = buildAgentArgs(worker, promptFile);
    const { stdout, stderr, exitCode } = await exec(cliCmd, args, { cwd });
    return { exitCode, stdout, stderr };
}
