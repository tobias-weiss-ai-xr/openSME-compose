export const TRUST_WEIGHTS = {
    gate: 0.35,
    scope: 0.25,
    coverage: 0.2,
    retry: 0.1,
    affinity: 0.1,
};
export function clamp01(x) {
    if (Number.isNaN(x))
        return 0;
    return Math.max(0, Math.min(1, x));
}
/** Pure trust score in [0,1]. */
export function trustScore(f) {
    const retryFactor = f.retryCount <= 0 ? 1 : 1 / (1 + f.retryCount);
    const raw = (f.gatePass ? TRUST_WEIGHTS.gate : 0) +
        TRUST_WEIGHTS.scope * clamp01(f.scopeAdherence) +
        TRUST_WEIGHTS.coverage * clamp01(f.testCoverage) +
        TRUST_WEIGHTS.retry * retryFactor +
        TRUST_WEIGHTS.affinity * clamp01(f.affinity);
    return Math.round(clamp01(raw) * 1000) / 1000;
}
export function trustBucket(score, reviewThreshold = 0.5, trustThreshold = 0.8) {
    if (score >= trustThreshold)
        return 'trusted';
    if (score >= reviewThreshold)
        return 'review';
    return 'blocked';
}
export function evaluateTrust(f, reviewThreshold = 0.5, trustThreshold = 0.8) {
    const score = trustScore(f);
    return { score, bucket: trustBucket(score, reviewThreshold, trustThreshold) };
}
