export const CATEGORY = {
    ENDO: '16c2',
    PERIO: '16c3',
    EXTRACTIONS: '16c8',
    PROSTHO: '16c4',
    CROWNS: '16c1',
    IMPLANTS: '16c6',
    OTHER: '16c10',
};
export const PROCEDURE_UCR = {
    [CATEGORY.CROWNS]: 1200,
    [CATEGORY.ENDO]: 1000,
    [CATEGORY.PROSTHO]: 1400,
    [CATEGORY.PERIO]: 300,
    [CATEGORY.EXTRACTIONS]: 200,
    [CATEGORY.IMPLANTS]: 2500,
};
export const CATEGORY_WEIGHTS = {
    [CATEGORY.CROWNS]: 0.30,
    [CATEGORY.PROSTHO]: 0.25,
    [CATEGORY.ENDO]: 0.20,
    [CATEGORY.PERIO]: 0.15,
    [CATEGORY.EXTRACTIONS]: 0.10,
};
export const BREADTH_POINTS = {
    [CATEGORY.CROWNS]: 20,
    [CATEGORY.ENDO]: 20,
    [CATEGORY.PROSTHO]: 20,
    [CATEGORY.PERIO]: 15,
    [CATEGORY.EXTRACTIONS]: 10,
    [CATEGORY.IMPLANTS]: 10,
    [CATEGORY.OTHER]: 5,
};
export const OOP_SCORE_THRESHOLDS = [
    { maxOop: 0, score: 100 },
    { maxOop: 50, score: 90 },
    { maxOop: 150, score: 75 },
    { maxOop: 300, score: 60 },
    { maxOop: 500, score: 40 },
    { maxOop: 700, score: 20 },
];
export const OOP_SCORE_FALLBACK = 5;
export const MAX_BENEFIT_THRESHOLDS = [
    { min: Infinity, score: 100 },
    { min: 5000, score: 90 },
    { min: 3000, score: 75 },
    { min: 2000, score: 60 },
    { min: 1000, score: 35 },
    { min: 1, score: 15 },
];
export const MAX_BENEFIT_FALLBACK = 0;
export const TEMPORAL_LIMIT_MAX_SCORE = {
    fullSuite: { minCategories: 5, score: 90 },
    partial: { minCategories: 3, score: 60 },
    narrow: 0,
};
export const COMPOSITE_WEIGHTS = {
    costDominant: { cost: 0.40, max: 0.10, breadth: 0.20, access: 0.10 },
    maxDominant: { cost: 0.30, max: 0.30, breadth: 0.20, access: 0.10 },
};
export const PREVENTIVE_BONUS = 10;
export const REALIZED_VALUE = {
    coinsuranceDivisor: 200,
    minCoinsuranceMultiplier: 0.5,
    coinsuranceFallbackMultiplier: 0.85,
    visionFlatMultiplier: 0.95,
    maxPlausibleDentalMax: 10000,
};
