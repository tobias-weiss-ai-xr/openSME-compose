/**
 * verify.ts — multi-stage verification (the "verification-as-product" angle).
 *
 * v1 had a single `accept` shell command. Research (omux, 6-patterns, the new
 * "Agentic Technical Debt" literature) shows single-stage gates are weak. v2
 * composes independent stages:
 *   1. accept        — deterministic shell gate (exit 0 = pass)
 *   2. constitution  — machine-checkable rules on the diff (port of v1
 *                      lib/constitution.sh: no secrets, in-scope, no debug code)
 *   3. review        — independent cross-vendor verifier agrees
 *
 * All stage logic here is pure + tested; execution goes through injectable
 * seams so no real process runs in tests.
 */
import { z } from 'zod';
export const VerificationStage = z.enum(['accept', 'constitution', 'review']);
/** Pure: a non-zero exit means the gate failed. */
export function acceptResult(exitCode, stdout = '', stderr = '') {
    return { exitCode, passed: exitCode === 0, stdout, stderr };
}
// ---------------------------------------------------------------------------
// Constitution checks (pure text analysis)
// ---------------------------------------------------------------------------
const SECRET_PATTERNS = [
    /password\s*[:=]\s*['"][^'"]{3,}/i,
    /api[_-]?key\s*[:=]\s*['"][^'"]{8,}/i,
    /secret\s*[:=]\s*['"][^'"]{8,}/i,
    /token\s*[:=]\s*['"][^'"]{8,}/i,
    /BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY/,
];
const DEBUG_PATTERNS = [
    /\bconsole\.log\b/,
    /\bprint\(/,
    /\bdebugger\b/,
    /\bimport pdb\b/,
    /\bbreakpoint\(/,
    /\bfmt\.Println\b/,
    /\bTODO\(\)/,
    /\bFIXME\(\)/,
];
export function findSecretViolations(diff) {
    const out = [];
    for (const re of SECRET_PATTERNS) {
        if (re.test(diff))
            out.push(`secret pattern detected: ${re.source}`);
    }
    return out;
}
export function findDebugViolations(diff) {
    const out = [];
    for (const re of DEBUG_PATTERNS) {
        if (re.test(diff))
            out.push(`debug code detected: ${re.source}`);
    }
    return out;
}
/** A changed file matches scope if it equals a scope entry or sits beneath it. */
export function outOfScopeFiles(changed, scope) {
    if (scope.length === 0)
        return []; // undeclared scope → don't block
    const prefixes = scope.map((s) => (s.endsWith('/') ? s : s + '/'));
    return changed.filter((f) => !scope.includes(f) && !prefixes.some((p) => f.startsWith(p)));
}
export function constitutionViolations(r) {
    const v = [];
    if (r.checkSecrets !== false)
        v.push(...findSecretViolations(r.diff));
    if (r.checkDebug !== false)
        v.push(...findDebugViolations(r.diff));
    if (r.checkScope !== false) {
        const oob = outOfScopeFiles(r.changed, r.scope);
        for (const f of oob)
            v.push(`out-of-scope change: ${f}`);
    }
    return v;
}
/**
 * Run configured stages in order. Short-circuits on first failure.
 * `gateExec` and `reviewApproved` are injected for testability.
 */
export async function verifyMultiStage(cfg, gateExec, reviewApproved = async () => true) {
    const stages = [];
    if (cfg.accept) {
        const { stdout, stderr, exitCode } = await gateExec(cfg.accept.cmd, cfg.accept.args, { cwd: cfg.accept.cwd });
        const res = acceptResult(exitCode, stdout, stderr);
        stages.push({
            stage: 'accept',
            passed: res.passed,
            details: `exit=${exitCode}`,
        });
        if (!res.passed)
            return { passed: false, stages };
    }
    if (cfg.constitution) {
        const v = constitutionViolations(cfg.constitution);
        stages.push({
            stage: 'constitution',
            passed: v.length === 0,
            details: v.length ? v.join('; ') : 'ok',
        });
        if (v.length)
            return { passed: false, stages };
    }
    if (cfg.requireReview) {
        const approved = await reviewApproved();
        stages.push({
            stage: 'review',
            passed: approved,
            details: approved ? 'independent reviewer approved' : 'reviewer rejected',
        });
        if (!approved)
            return { passed: false, stages };
    }
    return { passed: true, stages };
}
