import { resolveFillsPerYear } from './oop-estimator.mjs';
export const OFF_FORMULARY_RETAIL = Object.freeze({
    margin_generic: 0.45,
    margin_brand: 0.08,
    dispensing_fee: 10.50,
});
export function roundCents(n) {
    return Math.round(n * 100) / 100;
}
export function isGenericDrug(drug) {
    const ig = drug ? drug.isGeneric : null;
    if (ig === 1 || ig === '1' || ig === true)
        return true;
    if (ig === 0 || ig === '0' || ig === false)
        return false;
    const tty = drug && drug.tty ? String(drug.tty).toUpperCase() : null;
    if (tty === 'GPCK' || tty === 'SCD' || tty === 'SCDC')
        return true;
    if (tty === 'BPCK' || tty === 'SBD')
        return false;
    return null;
}
export function marginFor(drug) {
    return isGenericDrug(drug) === true
        ? OFF_FORMULARY_RETAIL.margin_generic
        : OFF_FORMULARY_RETAIL.margin_brand;
}
export function computeOffFormularyRetail(input) {
    const SUPPRESS = { annualRetail: null, unitRetail: null, costDataSource: null };
    if (!input)
        return SUPPRESS;
    const { unitPrice, priceSource } = input;
    if (!Number.isFinite(unitPrice) || unitPrice <= 0)
        return SUPPRESS;
    const isNadac = typeof priceSource === 'string' && priceSource.startsWith('nadac');
    if (isNadac && input.feedStale)
        return SUPPRESS;
    const qty = Number.isFinite(input.quantity) && input.quantity > 0 ? input.quantity : 30;
    const fills = resolveFillsPerYear({ fillsPerYear: input.fillsPerYear, daysSupply: input.daysSupply });
    const markupFactor = isNadac ? 1 + marginFor(input) : 1.0;
    const price = unitPrice;
    const perFill = price * qty * markupFactor + OFF_FORMULARY_RETAIL.dispensing_fee;
    return {
        annualRetail: roundCents(perFill * fills),
        unitRetail: roundCents(price * markupFactor),
        costDataSource: isNadac ? 'nadac_retail' : 'reference_price',
    };
}
