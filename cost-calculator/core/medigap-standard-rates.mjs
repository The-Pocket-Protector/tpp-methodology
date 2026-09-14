export const TIER_SUFFIX_RE = /\s*\((preferred|standard(?:\s+[ivx]+)?|select|innovative)\)\s*$/i;
export function toNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
}
export function getDefaultPremiumInfo(row) {
    const explicitStandard = toNumber(row?.standard_monthly_premium);
    if (explicitStandard !== null) {
        return { premium: explicitStandard, basis: 'standard_monthly_premium' };
    }
    const explicitUndiscounted = toNumber(row?.undiscounted_premium);
    if (explicitUndiscounted !== null) {
        return { premium: explicitUndiscounted, basis: 'undiscounted_premium' };
    }
    const high = toNumber(row?.premium_high ?? row?.monthly_premium_high);
    if (high !== null) {
        return { premium: high, basis: 'premium_high' };
    }
    return { premium: null, basis: 'unavailable' };
}
export function getStandardPremium(row) {
    return getDefaultPremiumInfo(row).premium;
}
export function getDiscountPremium(row) {
    const standard = getStandardPremium(row);
    const explicit = toNumber(row?.household_discount_premium);
    if (explicit != null && (standard == null || explicit < standard))
        return explicit;
    const candidates = [
        row?.hhd_std_low,
        row?.hhd_room_low,
        row?.hhd_std_high,
        row?.hhd_room_high,
    ];
    for (const value of candidates) {
        const num = toNumber(value);
        if (num != null && num < (standard ?? Infinity))
            return num;
    }
    return null;
}
export function getCarrierBaseName(carrierName) {
    return String(carrierName || '').replace(TIER_SUFFIX_RE, '').trim();
}
export function isStandardVariant(row) {
    const haystack = `${row?.carrier_name || row?.carrier || ''} ${row?.rate_tier || row?.tier || ''}`;
    return /\bstandard\b/i.test(haystack) && !/\bpreferred\b/i.test(haystack);
}
export function isPreferredVariant(row) {
    const haystack = `${row?.carrier_name || row?.carrier || ''} ${row?.rate_tier || row?.tier || ''}`;
    return /\bpreferred\b/i.test(haystack);
}
export function variantRank(row) {
    if (isStandardVariant(row))
        return 0;
    if (isPreferredVariant(row))
        return 2;
    return 1;
}
export function premiumSortValue(row) {
    return getStandardPremium(row) ?? Number.POSITIVE_INFINITY;
}
export function planIsStandardDefaulted(planLetter) {
    return String(planLetter || '').toUpperCase() === 'G';
}
export function standardizeMedigapRows(rows, planLetter) {
    const list = Array.isArray(rows) ? rows : [];
    if (!planIsStandardDefaulted(planLetter))
        return list;
    const selected = new Map();
    const preferredByKey = new Map();
    list.forEach((row, index) => {
        const base = getCarrierBaseName(row.carrier_name || row.carrier);
        const key = [base.toLowerCase(), row.plan_letter, row.state, row.zipcode, row.age, row.gender, row.tobacco_use].join('|');
        const defaultPremium = getDefaultPremiumInfo(row);
        const candidate = {
            ...row,
            carrier_name: base || row.carrier_name,
            undiscounted_premium: defaultPremium.premium,
            standard_monthly_premium: defaultPremium.premium,
            default_premium_basis: defaultPremium.basis,
            household_discount_premium: getDiscountPremium(row),
            preferred_rate_suppressed_by_default: isPreferredVariant(row),
        };
        if (isPreferredVariant(row)) {
            const preferred = preferredByKey.get(key);
            if (!preferred || (defaultPremium.premium ?? Infinity) < (preferred.preferred_discount_premium ?? Infinity)) {
                preferredByKey.set(key, {
                    preferred_discount_premium: defaultPremium.premium,
                });
            }
        }
        const current = selected.get(key);
        if (!current) {
            selected.set(key, { row: candidate, rank: variantRank(row), index });
            return;
        }
        const rank = variantRank(row);
        if (rank < current.rank || (rank === current.rank && premiumSortValue(row) < premiumSortValue(current.row))) {
            selected.set(key, { row: candidate, rank, index });
        }
    });
    return Array.from(selected.entries())
        .map(([key, value]) => ({
        ...value,
        row: {
            ...value.row,
            ...(preferredByKey.get(key) || {}),
        },
    }))
        .sort((a, b) => {
        return premiumSortValue(a.row) - premiumSortValue(b.row) || a.index - b.index;
    })
        .map(({ row }) => row);
}
