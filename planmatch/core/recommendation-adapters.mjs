export const NULLISH_MONEY = new Set(['', 'N/A', 'NOT APPLICABLE', 'NOT AVAILABLE', 'NOT ENOUGH DATA AVAILABLE', 'NA', 'NULL']);
export function parseCmsMoney(value) {
    if (value === undefined || value === null)
        return null;
    if (typeof value === 'number')
        return Number.isFinite(value) ? value : null;
    const raw = String(value).trim();
    if (NULLISH_MONEY.has(raw.toUpperCase()))
        return null;
    const n = parseFloat(raw.replace(/[$,]/g, ''));
    return Number.isFinite(n) ? n : null;
}
export function maPlanIncludesPartD(partDCoverage) {
    const value = String(partDCoverage || '').toLowerCase();
    return value !== 'no' && value !== '' && value !== 'n/a';
}
