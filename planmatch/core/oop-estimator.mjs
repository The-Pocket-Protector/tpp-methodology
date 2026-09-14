export const DEFAULT_FILLS_BY_DAYS_SUPPLY = Object.freeze({ 30: 12, 60: 6, 90: 4 });
export function resolveFillsPerYear(input) {
    if (Number.isFinite(input.fillsPerYear) && input.fillsPerYear > 0)
        return input.fillsPerYear;
    const days = parseInt(String(input.daysSupply), 10);
    return DEFAULT_FILLS_BY_DAYS_SUPPLY[days] || 12;
}
