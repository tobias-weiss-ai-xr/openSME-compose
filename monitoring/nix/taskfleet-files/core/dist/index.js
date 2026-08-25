/**
 * index.ts — public API surface of @earendil-works/taskfleet.
 *
 * Re-exports the stable modules so consumers (the orchestrator loop, the
 * dashboard, external tools) import from one place.
 */
export * from './types.js';
export * from './config.js';
export * from './engine/ledger.js';
export * from './engine/board.js';
export * from './engine/scheduler.js';
export * from './engine/trust.js';
export * from './engine/verify.js';
export * from './engine/groups.js';
export * from './engine/worktree.js';
// Loop exports named explicitly to avoid clashing default executors
// (defaultAgentExec / defaultGitExec) already exported by agent/worktree.
export { runLoop, runRound, summarize, pickWorker, scopeAdherence, buildPrompt, retryCount, } from './engine/loop.js';
export * from './dispatch/agent.js';
export { run, parseArgs, HELP } from './cli.js';
