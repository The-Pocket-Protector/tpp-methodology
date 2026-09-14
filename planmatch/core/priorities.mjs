export const RECOMMEND_WEIGHT_DIMENSIONS = ['premium', 'out_of_pocket', 'pharmacy_network', 'benefits'];
export const RECOMMEND_BENEFIT_PREFERENCES = new Set([
    'dental',
    'vision',
    'hearing',
    'fitness',
    'otc',
    'transportation',
    'telehealth',
    'meal-delivery',
    'acupuncture',
    'worldwide-coverage',
]);
export const LEGACY_CARE_PRIORITY_TOKENS = new Set([
    'drug',
    'drug-coverage',
    'drug-coverage-weight',
    'doctor',
    'provider',
    'doctor-coverage',
    'provider-coverage',
    'broad-network',
    'keep-doctors',
]);
export function normalizePriorityToken(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/_/g, '-')
        .replace(/\s+/g, '-');
}
export function mapPriorityKeyToWeightDimension(value) {
    const token = normalizePriorityToken(value);
    switch (token) {
        case 'premium':
        case 'low-premium':
            return 'premium';
        case 'oop':
        case 'low-oop':
        case 'low-copay':
        case 'out-of-pocket':
            return 'out_of_pocket';
        case 'benefits':
            return 'benefits';
        case 'pharmacy':
        case 'pharmacy-network':
            return 'pharmacy_network';
        case 'cost':
            return 'cost';
        case 'quality':
            return 'quality';
        default:
            return null;
    }
}
export function isLegacyCarePriorityKey(value) {
    return LEGACY_CARE_PRIORITY_TOKENS.has(normalizePriorityToken(value));
}
