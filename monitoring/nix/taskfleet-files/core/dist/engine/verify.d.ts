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
export declare const VerificationStage: z.ZodEnum<["accept", "constitution", "review"]>;
export type VerificationStage = z.infer<typeof VerificationStage>;
export interface AcceptResult {
    exitCode: number;
    passed: boolean;
    stdout: string;
    stderr: string;
}
export type GateExec = (cmd: string, args: string[], opts?: {
    cwd?: string;
}) => Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
}>;
/** Pure: a non-zero exit means the gate failed. */
export declare function acceptResult(exitCode: number, stdout?: string, stderr?: string): AcceptResult;
export interface ConstitutionRules {
    /** Files the task is allowed to modify. */
    scope: string[];
    /** Files actually changed in the diff. */
    changed: string[];
    /** Diff text to scan for secrets / debug code. */
    diff: string;
    /** Disable individual checks if needed. */
    checkSecrets?: boolean;
    checkDebug?: boolean;
    checkScope?: boolean;
}
export declare function findSecretViolations(diff: string): string[];
export declare function findDebugViolations(diff: string): string[];
/** A changed file matches scope if it equals a scope entry or sits beneath it. */
export declare function outOfScopeFiles(changed: string[], scope: string[]): string[];
export declare function constitutionViolations(r: ConstitutionRules): string[];
export interface StageOutcome {
    stage: VerificationStage;
    passed: boolean;
    details: string;
}
export interface MultiStageConfig {
    accept?: {
        cmd: string;
        args: string[];
        cwd?: string;
    };
    constitution?: ConstitutionRules;
    /** When true, require an independent reviewer's approval to pass. */
    requireReview?: boolean;
}
export interface VerificationResult {
    passed: boolean;
    stages: StageOutcome[];
}
/**
 * Run configured stages in order. Short-circuits on first failure.
 * `gateExec` and `reviewApproved` are injected for testability.
 */
export declare function verifyMultiStage(cfg: MultiStageConfig, gateExec: GateExec, reviewApproved?: () => Promise<boolean>): Promise<VerificationResult>;
