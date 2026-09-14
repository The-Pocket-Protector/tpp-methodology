import { formatDrugDisplayName } from './drug-display-format.mjs';
export function normalizeNullableNumber(value) {
    if (value == null || value === '')
        return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
export function monthlyFromAnnual(annual) {
    if (annual == null)
        return null;
    return Math.round((annual / 12) * 100) / 100;
}
export function normalizeNullableTier(value) {
    if (value == null || value === '')
        return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
export function normalizeOptionalBoolean(value) {
    return typeof value === 'boolean' ? value : undefined;
}
export function inferCovered(detail, tier) {
    if (typeof detail.covered === 'boolean')
        return detail.covered;
    return Number.isFinite(tier) && tier > 0;
}
export function normalizeDrugDetail(detail) {
    if (!detail || typeof detail !== 'object' || Array.isArray(detail))
        return null;
    const d = detail;
    const drugName = String(d.drug_name ?? d.name ?? '').trim();
    if (!drugName)
        return null;
    const providedDisplayName = typeof d.display_name === 'string' ? d.display_name.trim() : '';
    const displayName = providedDisplayName || formatDrugDisplayName(drugName) || drugName;
    const tier = normalizeNullableTier(d.tier);
    const estimatedAnnualCost = normalizeNullableNumber(d.estimated_annual_cost ?? d.yearly ?? d.estimated_annual_oop);
    const normalized = {
        ...d,
        name: d.name ?? drugName,
        drug_name: drugName,
        display_name: displayName,
        tier,
        yearly: normalizeNullableNumber(d.yearly ?? estimatedAnnualCost),
        estimated_annual_cost: estimatedAnnualCost,
        estimated_monthly_cost: monthlyFromAnnual(estimatedAnnualCost),
        covered: inferCovered(d, tier),
    };
    const priorAuth = normalizeOptionalBoolean(d.prior_auth ?? d.pa);
    if (priorAuth !== undefined)
        normalized.prior_auth = priorAuth;
    const stepTherapy = normalizeOptionalBoolean(d.step_therapy ?? d.st);
    if (stepTherapy !== undefined)
        normalized.step_therapy = stepTherapy;
    const quantityLimit = normalizeOptionalBoolean(d.quantity_limit ?? d.ql);
    if (quantityLimit !== undefined)
        normalized.quantity_limit = quantityLimit;
    return normalized;
}
export function normalizeDrugDetails(details) {
    if (!Array.isArray(details))
        return [];
    return details
        .map(normalizeDrugDetail)
        .filter((d) => Boolean(d));
}
