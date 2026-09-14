export type NonCareRankingWeightKey = 'premium' | 'out_of_pocket' | 'pharmacy_network' | 'benefits';

export type NonCareRankingWeights = Record<NonCareRankingWeightKey, number>;

const NON_CARE_RANKING_WEIGHT_KEYS: readonly NonCareRankingWeightKey[] = [
    'premium',
    'out_of_pocket',
    'pharmacy_network',
    'benefits',
];

export function normalizeNonCareRankingWeights(inputWeights: Partial<Record<NonCareRankingWeightKey, unknown>> = {}): NonCareRankingWeights {
    const base: Partial<Record<NonCareRankingWeightKey, unknown>> = {
        ...inputWeights,
    };
    const fallback: NonCareRankingWeights = {
        premium: 12,
        out_of_pocket: 10,
        pharmacy_network: 5,
        benefits: 10,
    };
    const keys = NON_CARE_RANKING_WEIGHT_KEYS;
    const total = keys.reduce((sum, key) => sum + Math.max(0, Number(base[key]) || 0), 0);
    const weights: Partial<Record<NonCareRankingWeightKey, unknown>> = total > 0 ? base : fallback;
    const weightTotal = keys.reduce((sum, key) => sum + Math.max(0, Number(weights[key]) || 0), 0);
    const normalized: NonCareRankingWeights = {
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
