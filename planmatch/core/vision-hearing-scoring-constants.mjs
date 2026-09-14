export const VISION_WEIGHTS = { eyewear: 55, exam: 25, richness: 15, access: 5 };
export const VISION_WEIGHTS_PROGRESSIVE = { eyewear: 55, exam: 20, richness: 20, access: 5 };
export const HEARING_WEIGHTS = { aid: 55, extras: 20, cadence: 15, exam: 10 };
export const VISION_PREFERENCE_LADDER = [
    [80, 30], [60, 22], [40, 15], [20, 8],
];
export const VISION_PREFERENCE_FLOOR = 3;
export const HEARING_PREFERENCE_LADDER = [
    [80, 45], [60, 35], [40, 25], [20, 15],
];
export const HEARING_PREFERENCE_FLOOR = 5;
export const QUALITY_BONUS_MAX_BY_BENEFIT = {
    dental: 15, hearing: 15, vision: 10,
};
export const VISION_EYEWEAR_CURVE = [
    [0, 0], [150, 15], [200, 30], [300, 42], [400, 50], [600, 55],
];
export const VISION_EXAM_BANDS = [
    { maxCopay: 0, points: 25 }, { maxCopay: 10, points: 20 }, { maxCopay: 25, points: 14 },
    { maxCopay: 45, points: 8 },
];
export const VISION_EXAM_WORST = 4;
export const VISION_EXAM_COINS_WORST_PCT = 20;
export const VISION_EXAM_NEUTRAL = 12;
export const VISION_RICHNESS = {
    base: 7,
    lensMenu: 3,
    progressivesAtZeroTier: 2,
    coatings: 2,
    contactsVariety: 2,
    upgrades: 2,
    contactFitting: 3,
};
export const VISION_ACCESS = { start: 5, deductibleFiled: -2, noOonReimbursement: -1, referralRequired: -2 };
export const VISION_BOTH_EYEWEAR_MULTIPLIER = 1.1;
export const HEARING_COPAY_TIER_BANDS = [
    { maxPairOop: 0, points: 55 }, { maxPairOop: 398, points: 44 }, { maxPairOop: 1198, points: 33 },
    { maxPairOop: 1998, points: 22 },
];
export const HEARING_COPAY_TIER_WORST = 12;
export const HEARING_CEILING_MODIFIER = { richMax: 999, poorMin: 1495, bonus: 4, penalty: -4 };
export const HEARING_ALLOWANCE_CURVE = [
    [300, 10], [600, 20], [1200, 33], [2400, 55],
];
export const HEARING_VENDOR_NO_PRICE_AID = 20;
export const HEARING_UNSPECIFIED_AID = 27;
export const HEARING_EXTRAS_POINTS = {
    batteries: 4, trial: 4, rechargeable: 3, otcAids: 3, followUp: 3, warranty: 3,
};
export const HEARING_EXTRAS_NEUTRAL = 10;
export const HEARING_CADENCE_POINTS = { '3': 15, '2': 9, '1': 5 };
export const HEARING_CADENCE_NEUTRAL = 9;
export const HEARING_EXAM_BANDS = [
    { maxCopay: 0, points: 10 }, { maxCopay: 25, points: 7 }, { maxCopay: 45, points: 4 },
];
export const HEARING_EXAM_WORST = 2;
export const HEARING_EXAM_NEUTRAL = 5;
export function interpolateCurve(curve, x) {
    if (x <= curve[0][0])
        return curve[0][1];
    for (let i = 1; i < curve.length; i += 1) {
        const [x1, y1] = curve[i - 1];
        const [x2, y2] = curve[i];
        if (x <= x2)
            return y1 + ((x - x1) / (x2 - x1)) * (y2 - y1);
    }
    return curve[curve.length - 1][1];
}
export function ladderPoints(ladder, floor, qualityScore) {
    for (const [minQuality, points] of ladder) {
        if (qualityScore >= minQuality)
            return points;
    }
    return floor;
}
