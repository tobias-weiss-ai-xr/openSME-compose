/**
 * loop.ts — the native dispatch loop (the core of taskfleet v2).
 *
 * This is what replaces the legacy bash orchestrator. One round:
 *   1. scheduler picks ready, non-contentious tasks (critical-path priority)
 *   2. for each slot: claim a worker, isolate a git worktree, dispatch the agent
 *   3. verify the result (accept gate + constitution) and score trust
 *   4. trusted → merge + done; review → escalate; blocked → retry / fail
 *   5. every transition is appended to the append-only ledger (event sourcing)
 *
 * All side effects (agent, git, gate, review) go through injectable seams so
 * the engine is exhaustively testable with zero real subprocesses.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { selectReady } from './scheduler.js';
import { workersForTier } from '../config.js';
import { WorktreeManager } from './worktree.js';
import { dispatchAgent } from '../dispatch/agent.js';
import { evaluateTrust } from './trust.js';
import { outOfScopeFiles, verifyMultiStage, } from './verify.js';
const execFileP = promisify(execFile);
function exitCodeOf(err) {
    if (!err)
        return 0;
    const code = err.code;
    if (typeof code === 'number')
        return code;
    return 1; // spawn failure (e.g. ENOENT) — treat as non-zero
}
export const defaultAgentExec = (cmd, args, opts) => new Promise((resolve) => {
    execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
        resolve({
            stdout: stdout.toString(),
            stderr: stderr.toString(),
            exitCode: exitCodeOf(err),
        });
    });
});
export const defaultGitExec = (file, args) => execFileP(file, args, { maxBuffer: 64 * 1024 * 1024 });
export const defaultGateExec = (cmd, args, opts) => new Promise((resolve) => {
    execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
        resolve({
            stdout: stdout.toString(),
            stderr: stderr.toString(),
            exitCode: exitCodeOf(err),
        });
    });
});
/** Seed a task:created event for each task not yet present in the ledger. */
async function seedCreated(ctx) {
    const existing = new Set(await ctx.ledger.taskIds());
    for (const t of ctx.tasks) {
        if (!existing.has(t.id)) {
            ctx.ledger.appendSync({ type: 'task:created', id: t.id, ts: Date.now(), task: t });
        }
    }
}
function resolveCtx(ctx) {
    return {
        tasks: ctx.tasks,
        workers: ctx.workers,
        ledger: ctx.ledger,
        onlyTask: ctx.onlyTask,
        cliCmd: ctx.cliCmd ?? process.env.TF_AGENT_CMD ?? 'pi',
        agentExec: ctx.agentExec ?? defaultAgentExec,
        gitExec: ctx.gitExec ?? defaultGitExec,
        gateExec: ctx.gateExec ?? defaultGateExec,
        reviewApproved: ctx.reviewApproved ?? (async () => true),
        repoDir: ctx.repoDir,
        maxParallel: ctx.maxParallel ?? Number(process.env.TF_MAX_PARALLEL ?? 2),
        requireReview: ctx.requireReview ?? false,
        reviewThreshold: ctx.reviewThreshold ?? 0.5,
        trustThreshold: ctx.trustThreshold ?? 0.8,
        maxRetries: ctx.maxRetries ?? 2,
        promptsDir: ctx.promptsDir ?? `${ctx.repoDir}/.taskfleet/prompts`,
        baseBranch: ctx.baseBranch ?? 'main',
    };
}
// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------
/** Pick a worker for a task: first enabled worker serving its tier, else any. */
export function pickWorker(workers, task) {
    const tier = workersForTier(workers, task.model_tier);
    if (tier.length)
        return tier[0];
    return workers.find((w) => w.enabled);
}
export function retryCount(events, id) {
    return events.filter((e) => e.type === 'task:retry' && e.id === id).length;
}
/** Fraction of changed files that lie within declared scope, 0..1. */
export function scopeAdherence(changed, scope) {
    if (changed.length === 0)
        return 1;
    const oob = outOfScopeFiles(changed, scope);
    return (changed.length - oob.length) / changed.length;
}
export function buildPrompt(task) {
    const parts = [
        `# Task ${task.id}: ${task.title}`,
        '',
        task.acceptance_prose ? `## Acceptance criteria\n${task.acceptance_prose}` : '',
        task.accept ? `## Verification command\n\`${task.accept}\`` : '',
        '',
        'Implement this task in the current git worktree. Commit your changes to the',
        'current branch. Do not modify files outside the agreed scope.',
    ];
    return parts.filter(Boolean).join('\n');
}
// ---------------------------------------------------------------------------
// One round
// ---------------------------------------------------------------------------
export async function runRound(ctxIn, board) {
    const ctx = resolveCtx(ctxIn);
    const out = {
        dispatched: [],
        completed: [],
        pendingReview: [],
        failed: [],
        retried: [],
        events: [],
    };
    const emit = (ev) => {
        ctx.ledger.appendSync(ev);
        out.events.push(ev);
    };
    const running = new Set([...board.status.entries()]
        .filter(([, s]) => s === 'running' || s === 'verifying')
        .map(([id]) => id));
    let ready = selectReady(ctx.tasks, board, running);
    if (ctx.onlyTask)
        ready = ready.filter((id) => id === ctx.onlyTask);
    const slots = Math.max(0, ctx.maxParallel - running.size);
    const selected = ready.slice(0, slots);
    const wt = new WorktreeManager(ctx.repoDir, ctx.gitExec);
    const base = ctx.baseBranch;
    for (const id of selected) {
        const task = ctx.tasks.find((t) => t.id === id);
        if (!task)
            continue;
        const worker = pickWorker(ctx.workers, task);
        if (!worker) {
            emit({ type: 'task:failed', id, ts: Date.now(), reason: 'no worker available' });
            out.failed.push(id);
            continue;
        }
        const branch = `tf/${task.id}`;
        const wtPath = `${ctx.repoDir}/.taskfleet/wt/${task.id}`;
        const attempt = retryCount(board.events, id) + 1;
        try {
            await wt.add(branch, 'HEAD', wtPath);
        }
        catch {
            /* worktree may already exist from a prior attempt */
        }
        mkdirSync(ctx.promptsDir, { recursive: true });
        const promptFile = `${ctx.promptsDir}/${task.id}.md`;
        writeFileSync(promptFile, buildPrompt(task));
        const agentRes = await dispatchAgent(ctx.cliCmd, worker, promptFile, ctx.agentExec, wtPath);
        emit({ type: 'task:dispatch', id, ts: Date.now(), worker: worker.name, attempt });
        out.dispatched.push(id);
        if (agentRes.exitCode !== 0) {
            const retries = retryCount(board.events, id);
            if (retries < ctx.maxRetries) {
                emit({
                    type: 'task:retry',
                    id,
                    ts: Date.now(),
                    attempt: attempt + 1,
                    reason: `agent exit ${agentRes.exitCode}`,
                });
                out.retried.push(id);
            }
            else {
                emit({
                    type: 'task:failed',
                    id,
                    ts: Date.now(),
                    reason: `agent exit ${agentRes.exitCode}`,
                });
                out.failed.push(id);
            }
            try {
                await wt.remove(wtPath);
            }
            catch {
                /* ignore */
            }
            continue;
        }
        // Collect the diff produced by the agent in the worktree.
        const { stdout: namesOut } = await ctx.gitExec('git', [
            '-C',
            wtPath,
            'diff',
            '--name-only',
            `${base}...HEAD`,
        ]);
        const changed = namesOut
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean);
        const { stdout: diffOut } = await ctx.gitExec('git', [
            '-C',
            wtPath,
            'diff',
            `${base}...HEAD`,
        ]);
        const cfg = {
            accept: task.accept
                ? { cmd: 'bash', args: ['-c', task.accept], cwd: wtPath }
                : undefined,
            constitution: { scope: task.scope, changed, diff: diffOut },
            requireReview: ctx.requireReview,
        };
        const verification = await verifyMultiStage(cfg, ctx.gateExec, ctx.reviewApproved);
        const factors = {
            gatePass: verification.passed,
            scopeAdherence: scopeAdherence(changed, task.scope),
            testCoverage: 1,
            retryCount: retryCount(board.events, id),
            affinity: 0.5,
        };
        const { score, bucket } = evaluateTrust(factors, ctx.reviewThreshold, ctx.trustThreshold);
        emit({ type: 'task:gate', id, ts: Date.now(), pass: verification.passed, exitCode: agentRes.exitCode });
        emit({ type: 'task:trust', id, ts: Date.now(), score, bucket });
        if (bucket === 'trusted') {
            try {
                await wt.merge(branch);
                await wt.remove(wtPath);
            }
            catch {
                /* ignore */
            }
            emit({ type: 'task:merge', id, ts: Date.now() });
            emit({ type: 'task:done', id, ts: Date.now() });
            out.completed.push(id);
        }
        else if (bucket === 'review') {
            emit({ type: 'task:approval:request', id, ts: Date.now() });
            out.pendingReview.push(id);
        }
        else {
            const retries = retryCount(board.events, id);
            if (retries < ctx.maxRetries) {
                emit({
                    type: 'task:retry',
                    id,
                    ts: Date.now(),
                    attempt: attempt + 1,
                    reason: `trust bucket ${bucket}`,
                });
                out.retried.push(id);
            }
            else {
                emit({
                    type: 'task:failed',
                    id,
                    ts: Date.now(),
                    reason: `trust bucket ${bucket}`,
                });
                out.failed.push(id);
            }
        }
    }
    return out;
}
export async function runLoop(ctxIn, opts = {}) {
    const ctx = resolveCtx(ctxIn);
    await seedCreated(ctx);
    const rounds = opts.rounds ?? 0;
    const all = [];
    let round = 0;
    for (;;) {
        const board = await ctx.ledger.replay();
        const outcome = await runRound(ctx, board);
        all.push(outcome);
        if (outcome.dispatched.length === 0)
            break;
        round += 1;
        if (rounds > 0 && round >= rounds)
            break;
    }
    return all;
}
/** Compact human summary of a loop run (for CLI output). */
export function summarize(rounds) {
    const dispatched = rounds.flatMap((r) => r.dispatched).length;
    const completed = rounds.flatMap((r) => r.completed).length;
    const pending = rounds.flatMap((r) => r.pendingReview).length;
    const failed = rounds.flatMap((r) => r.failed).length;
    const retried = rounds.flatMap((r) => r.retried).length;
    return (`taskfleet loop — ${rounds.length} round(s): ` +
        `dispatched=${dispatched} done=${completed} ` +
        `review=${pending} retried=${retried} failed=${failed}`);
}
