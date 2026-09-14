import { hasOwn } from './shared.mjs';
import { isPlainObject } from './shared.mjs';
import { normalizePriorityToken } from './priorities.mjs';
import { RECOMMEND_BENEFIT_PREFERENCES } from './priorities.mjs';
import { mapPriorityKeyToWeightDimension } from './priorities.mjs';
import { isLegacyCarePriorityKey } from './priorities.mjs';
import { RECOMMEND_WEIGHT_DIMENSIONS } from './priorities.mjs';
export function buildDefaultRecommendWeights() {
    return {
        premium: parseInt(process.env.PLANMATCH_W_PREMIUM || '') || 12,
        out_of_pocket: parseInt(process.env.PLANMATCH_W_OOP || '') || 10,
        pharmacy_network: parseInt(process.env.PLANMATCH_W_PHARMACY || '') || 5,
        benefits: parseInt(process.env.PLANMATCH_W_BENEFITS || '') || 10,
    };
}
export function normalizeWeightsToHundred(weights) {
    const next = {};
    for (const key of RECOMMEND_WEIGHT_DIMENSIONS) {
        next[key] = Math.max(0, Number(weights[key]) || 0);
    }
    const total = Object.values(next).reduce((sum, value) => sum + value, 0);
    if (total <= 0)
        return null;
    for (const key of RECOMMEND_WEIGHT_DIMENSIONS) {
        next[key] = (next[key] / total) * 100;
    }
    return next;
}
export function applyWeightDimension(weights, dimension, amount) {
    const value = Math.max(0, Number(amount) || 0);
    if (dimension === 'cost') {
        weights.premium += value / 2;
        weights.out_of_pocket += value / 2;
        return;
    }
    if (RECOMMEND_WEIGHT_DIMENSIONS.includes(dimension)) {
        weights[dimension] += value;
    }
}
export function normalizeRecommendPriorities(body) {
    const priorityFields = ['priorities', 'weights', 'user_priorities', 'benefit_preferences'];
    const arrayTokens = [];
    const numericSources = [];
    for (const fieldName of priorityFields) {
        if (!hasOwn(body, fieldName))
            continue;
        const rawValue = body[fieldName];
        if (Array.isArray(rawValue)) {
            arrayTokens.push(...rawValue);
            continue;
        }
        if (isPlainObject(rawValue)) {
            numericSources.push(rawValue);
            continue;
        }
        if (rawValue != null) {
            return {
                error: `\`${fieldName}\` must be an array or object`,
            };
        }
    }
    const normalizedTokens = [];
    const weightDimensions = new Set();
    const benefitPreferences = new Set();
    for (const token of arrayTokens) {
        const normalized = normalizePriorityToken(token);
        if (!normalized)
            continue;
        normalizedTokens.push(normalized);
        if (RECOMMEND_BENEFIT_PREFERENCES.has(normalized))
            benefitPreferences.add(normalized);
        const dimension = mapPriorityKeyToWeightDimension(normalized);
        if (dimension && dimension !== 'cost' && dimension !== 'quality') {
            weightDimensions.add(dimension);
        }
    }
    let weights = buildDefaultRecommendWeights();
    const numericWeightKeys = new Set();
    if (numericSources.length > 0) {
        const nextWeights = {
            premium: 0,
            out_of_pocket: 0,
            pharmacy_network: 0,
            benefits: 0,
        };
        for (const source of numericSources) {
            for (const [rawKey, rawValue] of Object.entries(source)) {
                const numericValue = Number(rawValue);
                if (!Number.isFinite(numericValue))
                    continue;
                if (isLegacyCarePriorityKey(rawKey)) {
                    return {
                        error: 'Please add doctor and drug details separately from your other priorities.',
                    };
                }
                const dimension = mapPriorityKeyToWeightDimension(rawKey);
                if (!dimension || dimension === 'quality')
                    continue;
                applyWeightDimension(nextWeights, dimension, numericValue);
                if (dimension === 'cost') {
                    numericWeightKeys.add('premium');
                    numericWeightKeys.add('out_of_pocket');
                }
                else {
                    numericWeightKeys.add(dimension);
                }
            }
        }
        if (numericWeightKeys.size === 0) {
            return {
                error: 'Please choose at least one supported priority.',
            };
        }
        const normalizedNumericWeights = normalizeWeightsToHundred(nextWeights);
        if (!normalizedNumericWeights) {
            return {
                error: 'Please choose at least one priority above zero.',
            };
        }
        weights = normalizedNumericWeights;
    }
    else {
        if (weightDimensions.has('premium')) {
            weights.premium += 20;
            weights.benefits -= 5;
        }
        if (weightDimensions.has('out_of_pocket')) {
            weights.out_of_pocket += 20;
            weights.benefits -= 5;
            weights.premium -= 5;
        }
        if (weightDimensions.has('benefits')) {
            weights.benefits += 15;
            weights.premium -= 5;
            weights.out_of_pocket -= 5;
        }
        weights = normalizeWeightsToHundred(weights);
    }
    return {
        weights,
        input_tokens: [...new Set(normalizedTokens)],
        weight_dimensions: [...weightDimensions],
        benefit_preferences: [...benefitPreferences],
        numeric_weight_keys: [...numericWeightKeys],
    };
}
