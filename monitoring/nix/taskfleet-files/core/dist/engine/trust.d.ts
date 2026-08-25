/**
 * trust.ts — trust score + bucket for merge gating (HITL layer).
 *
 * Port of v1's `lib/trust.sh` heuristic into pure functions. This is the
 * "human-in-the-loop trust layer" angle from the c2-ai corpus: a dispatch that
 * passes its gate is not automatically merged — it is scored, bucketed, and only
 * `trusted` merges automatically; `review` escalates, `blocked` retries/fails.
 */
import { TrustBucket } from '../types.js';
export interface TrustFactors {
    /** Did the acceptance gate exit 0? */
    gatePass: boolean;
    /** Fraction of the diff inside declared scope files, 0..1. */
    scopeAdherence: number;
    /** Tests passed / tests run, 0..1 (default 1 when no test signal). */
    testCoverage: number;
    /** Number of prior retries for this task. */
    retryCount: number;
    /** Historical win rate for this engine/worker, 0..1. */
    affinity: number;
}
export declare const TRUST_WEIGHTS: {
    readonly gate: 0.35;
    readonly scope: 0.25;
    readonly coverage: 0.2;
    readonly retry: 0.1;
    readonly affinity: 0.1;
};
export declare function clamp01(x: number): number;
/** Pure trust score in [0,1]. */
export declare function trustScore(f: TrustFactors): number;
export declare function trustBucket(score: number, reviewThreshold?: number, trustThreshold?: number): TrustBucket;
export interface TrustVerdict {
    score: number;
    bucket: TrustBucket;
}
export declare function evaluateTrust(f: TrustFactors, reviewThreshold?: number, trustThreshold?: number): TrustVerdict;
