export const VA_MEDICAL = 'va-medical';
export const MILITARY_COVERAGE_TOKENS = new Set(['va-medical', 'va-rx', 'tricare', 'champva']);
export function givebackRankingMode(env = process.env) {
    const value = String(env.MA_GIVEBACK_RANKING || '').toLowerCase();
    return value === 'rank' ? 'rank' : value === 'shadow' ? 'shadow' : 'off';
}
export function normalizeMilitaryCoverage(value) {
    if (!Array.isArray(value))
        return [];
    return [...new Set(value.filter((token) => typeof token === 'string' && MILITARY_COVERAGE_TOKENS.has(token)))];
}
export function militaryCoverageFromBody(body) {
    const context = body.compare_context;
    if (!context || typeof context !== 'object')
        return [];
    return normalizeMilitaryCoverage(context.military_coverage);
}
export function resolveGivebackRankingCase({ requestedOfferRx, militaryCoverage, }) {
    const tokens = normalizeMilitaryCoverage(militaryCoverage);
    const vaMedical = tokens.includes(VA_MEDICAL);
    const vaDrugsConfirmed = requestedOfferRx === false;
    if (vaDrugsConfirmed && vaMedical)
        return { case: 'all_va', placement: 'first' };
    if (vaDrugsConfirmed)
        return { case: 'va_rx_only', placement: 'after_coverage' };
    if (vaMedical)
        return { case: 'va_medical_only', placement: 'after_coverage' };
    return null;
}
export function compareGivebackDesc(blocks) {
    return (ai, bi) => (blocks[bi].components.giveback_annual || 0) - (blocks[ai].components.giveback_annual || 0);
}
export function poolMaxGivebackAnnual(blocks) {
    return blocks.reduce((max, block) => Math.max(max, block.components.giveback_annual || 0), 0);
}
export function resolveRankBasis(placement, poolMaxGiveback) {
    return placement !== null && poolMaxGiveback > 0 ? 'giveback' : 'proposed';
}
export function buildGivebackRankingAudit({ mode, resolution, basis, poolMaxGiveback, shadow, }) {
    return {
        mode,
        case: resolution.case,
        placement: resolution.placement,
        applied: basis === 'giveback',
        pool_max_giveback_annual: poolMaxGiveback,
        shadow,
    };
}
