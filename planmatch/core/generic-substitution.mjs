export function toFiniteOrNull(v) {
    if (v === null || v === undefined || v === '')
        return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}
export const SUGGESTION_REASON = Object.freeze({
    SKIP_NO_GENERIC: 'no_generic',
    SKIP_GENERIC_NOT_ON_PLAN: 'generic_not_on_plan',
    SKIP_NO_SAVINGS: 'no_savings',
    SUGGEST_WITH_SAVINGS: 'suggest_with_savings',
    SUGGEST_NO_DOLLAR: 'suggest_no_dollar',
});
export function buildGenericSuggestion(input = {}) {
    const { genericRxcui, genericName, strength, genericTier, genericCoveredOnPlan, genericAnnualOop, brandAnnualRetail, brandName, } = input;
    if (!genericRxcui)
        return { suggestion: null, reason: SUGGESTION_REASON.SKIP_NO_GENERIC };
    if (genericCoveredOnPlan !== true) {
        return { suggestion: null, reason: SUGGESTION_REASON.SKIP_GENERIC_NOT_ON_PLAN };
    }
    const retail = toFiniteOrNull(brandAnnualRetail);
    const oop = toFiniteOrNull(genericAnnualOop);
    let savings = null;
    if (retail != null && oop != null) {
        savings = Math.round((retail - oop) * 100) / 100;
        if (savings <= 0)
            return { suggestion: null, reason: SUGGESTION_REASON.SKIP_NO_SAVINGS };
    }
    const tier = toFiniteOrNull(genericTier);
    return {
        suggestion: {
            generic_rxcui: genericRxcui,
            generic_name: genericName,
            strength: strength || null,
            tier_on_plan: tier,
            covered_on_plan: true,
            estimated_annual_savings: savings,
            savings_estimable: savings != null,
            brand_name: brandName || null,
        },
        reason: savings != null
            ? SUGGESTION_REASON.SUGGEST_WITH_SAVINGS
            : SUGGESTION_REASON.SUGGEST_NO_DOLLAR,
    };
}
