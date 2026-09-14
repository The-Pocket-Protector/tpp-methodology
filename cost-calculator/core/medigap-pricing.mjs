export const STANDARD_PREMIUM_KEYS = [
    'standard_monthly_premium',
    'standardMonthlyPremium',
    'undiscounted_premium',
    'undiscountedPremium',
    'monthlyHigh',
    'premium_high',
    'monthly_premium_estimated',
    'monthly_premium_65',
    'monthly_premium',
    'premium',
    'monthly',
];
export const PREFERRED_PREMIUM_KEYS = [
    'preferred_discount_premium',
    'preferredDiscountPremium',
    'preferred_underwriting_premium',
    'preferredUnderwritingPremium',
    'preferred_monthly_premium',
    'preferredMonthlyPremium',
];
export const GI_PREMIUM_KEYS = [
    'gi_issue_monthly_premium',
    'giIssuePremium',
    'gi_issue_premium',
    'giIssueMonthlyPremium',
    'gi_monthly_premium',
    'giPremium',
    'guaranteed_issue_monthly_premium',
    'guaranteedIssueMonthlyPremium',
    'guaranteed_issue_premium',
    'guaranteedIssuePremium',
];
export function isRecord(value) {
    return value != null && typeof value === 'object' && !Array.isArray(value);
}
export function getMedigapSource(plan) {
    if (!plan)
        return null;
    return isRecord(plan.medigap) ? plan.medigap : plan;
}
export function pickPositiveNumber(source, keys) {
    if (!source)
        return null;
    for (const key of keys) {
        const value = Number(source[key]);
        if (Number.isFinite(value) && value > 0)
            return value;
    }
    return null;
}
export function getMedigapStandardPremiumValue(plan) {
    return pickPositiveNumber(getMedigapSource(plan), STANDARD_PREMIUM_KEYS);
}
export function getMedigapPreferredPremiumValue(plan) {
    const source = getMedigapSource(plan);
    const preferred = pickPositiveNumber(source, PREFERRED_PREMIUM_KEYS);
    const standard = getMedigapStandardPremiumValue(plan);
    if (preferred == null)
        return null;
    if (standard != null && preferred >= standard)
        return null;
    return preferred;
}
export function getMedigapGiIssuePremiumValue(plan) {
    return pickPositiveNumber(getMedigapSource(plan), GI_PREMIUM_KEYS);
}
export function getMedigapDisplayedPremium(plan, giStatus) {
    const standard = getMedigapStandardPremiumValue(plan);
    if (giStatus === 'yes') {
        const giIssue = getMedigapGiIssuePremiumValue(plan);
        if (giIssue != null)
            return { monthly: giIssue, basis: 'gi' };
        if (standard != null)
            return { monthly: standard, basis: 'standardGi' };
    }
    if (giStatus === 'no') {
        const preferred = getMedigapPreferredPremiumValue(plan);
        if (preferred != null)
            return { monthly: preferred, basis: 'preferred' };
    }
    if (standard != null)
        return { monthly: standard, basis: 'standard' };
    return { monthly: null, basis: 'unknown' };
}
