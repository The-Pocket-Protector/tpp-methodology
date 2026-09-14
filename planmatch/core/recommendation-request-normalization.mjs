import { CSNP_CONDITION_KEYS } from './shared-recommendation-constants.mjs';
export const NON_CARE_RANKING_WEIGHT_KEYS = [
    'premium',
    'out_of_pocket',
    'pharmacy_network',
    'benefits',
];
export function normalizeNonCareRankingWeights(inputWeights = {}) {
    const base = {
        ...inputWeights,
    };
    const fallback = {
        premium: 12,
        out_of_pocket: 10,
        pharmacy_network: 5,
        benefits: 10,
    };
    const keys = NON_CARE_RANKING_WEIGHT_KEYS;
    const total = keys.reduce((sum, key) => sum + Math.max(0, Number(base[key]) || 0), 0);
    const weights = total > 0 ? base : fallback;
    const weightTotal = keys.reduce((sum, key) => sum + Math.max(0, Number(weights[key]) || 0), 0);
    const normalized = {
        premium: 0,
        out_of_pocket: 0,
        pharmacy_network: 0,
        benefits: 0,
    };
    for (const key of keys) {
        normalized[key] = weightTotal > 0 ? (Math.max(0, Number(weights[key]) || 0) / weightTotal) * 100 : 0;
    }
    return normalized;
}
export function normalizeStringList(values) {
    const seen = new Set();
    const normalized = [];
    const list = Array.isArray(values) ? values : [];
    for (const value of list) {
        const item = String(value || '').trim();
        if (!item)
            continue;
        const key = item.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        normalized.push(item);
    }
    return normalized;
}
export function normalizeRecommendCsnpConditions(body) {
    return normalizeStringList([
        ...(Array.isArray(body.csnpConditions) ? body.csnpConditions : []),
        ...(Array.isArray(body.csnp_conditions) ? body.csnp_conditions : []),
    ]);
}
export function normalizeRecommendCsnpConditionKeys(body) {
    return normalizeStringList([
        ...(Array.isArray(body.csnp_condition_keys) ? body.csnp_condition_keys : []),
        ...(Array.isArray(body.csnpConditionKeys) ? body.csnpConditionKeys : []),
    ]).filter((key) => CSNP_CONDITION_KEYS.includes(key));
}
export function isSnpEligibilityPlanType(value) {
    const raw = String(value || '').trim().toLowerCase();
    const compact = raw.replace(/[^a-z0-9]+/g, '');
    if (!compact)
        return false;
    return compact === 'snp' || compact.endsWith('snp') || compact.includes('specialneeds');
}
export function normalizeRecommendOfferRx(value) {
    return typeof value === 'boolean' ? value : null;
}
export function normalizeRecommendPlanTypes(planTypes) {
    const seen = new Set();
    const normalized = [];
    const list = Array.isArray(planTypes) ? planTypes : [];
    for (const value of list) {
        const item = String(value || '').trim().toLowerCase();
        if (!item || isSnpEligibilityPlanType(item))
            continue;
        if (seen.has(item))
            continue;
        seen.add(item);
        normalized.push(item);
    }
    return normalized;
}
export function normalizeBooleanish(value) {
    if (value === true)
        return true;
    if (value === false || value === null || value === undefined)
        return false;
    const token = String(value).trim().toLowerCase();
    return ['1', 'true', 'yes', 'y'].includes(token);
}
export function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
export function normalizeHasMedicaid(input = {}) {
    const source = isRecord(input) ? input : { medicaid: input };
    return normalizeBooleanish(source.medicaid);
}
export function normalizeMedicaidAnswer(input = {}) {
    const source = isRecord(input) ? input : { medicaid: input };
    const token = String(source.medicaid ?? '').trim().toLowerCase();
    if (['yes', 'y', 'true', '1'].includes(token))
        return 'yes';
    if (['no', 'n', 'false', '0'].includes(token))
        return 'no';
    if (token === 'unsure')
        return 'unsure';
    return null;
}
export function normalizeMedicaidIntakeAnswer(value) {
    const token = String(value ?? '').trim().toLowerCase();
    return token === 'yes' || token === 'no' || token === 'unsure' ? token : null;
}
export function normalizeMedicaidProfile(input = {}) {
    const source = isRecord(input) ? input : { medicaid: input };
    const assistance = normalizeMedicaidAnswer(source);
    const followUpsApply = assistance === 'yes' || assistance === 'unsure';
    return {
        assistance,
        cost_sharing_covered: followUpsApply
            ? normalizeMedicaidIntakeAnswer(source.medicaid_cost_sharing)
            : null,
        full_benefits: followUpsApply
            ? normalizeMedicaidIntakeAnswer(source.full_medicaid_benefits)
            : null,
    };
}
export function hasPricedPayload(token, choices) {
    if (!choices)
        return false;
    const s = (v) => String(v ?? '').trim();
    switch (token) {
        case 'dental':
            return ['low', 'medium', 'high', 'very_high'].includes(s(choices.annual_spend ?? choices.annualSpend));
        case 'vision':
            return ['glasses', 'contacts', 'both'].includes(s(choices.wears ?? choices.eyewear));
        case 'hearing':
            return s(choices.replacement_timing ?? choices.replacementTiming) === 'soon'
                || s(choices.usage ?? choices.currentStatus) === 'prospective';
        case 'otc':
            return ['low', 'medium', 'high'].includes(s(choices.monthly_spend ?? choices.monthlySpend));
        default:
            return false;
    }
}
export function resolveBenefitIntent(token, choices) {
    if (String(choices?.intent ?? '') === 'coverage')
        return 'coverage';
    return hasPricedPayload(token, choices) ? 'priced_need' : 'coverage';
}
