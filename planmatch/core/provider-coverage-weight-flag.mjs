export function isProviderCoverageWeightEnabled(env = process.env) {
    const v = String(env.FEATURE_PROVIDER_COVERAGE_WEIGHT || '').toLowerCase();
    return v === '1' || v === 'true' || v === 'on';
}
