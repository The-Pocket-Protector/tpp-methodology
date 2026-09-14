export function isEmployerCostComparisonEnabled(env = process.env) {
    const v = String(env.FEATURE_EMPLOYER_COST_COMPARISON || '').toLowerCase();
    return v === '1' || v === 'true' || v === 'on';
}
