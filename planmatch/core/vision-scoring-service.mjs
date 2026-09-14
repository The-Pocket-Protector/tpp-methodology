import { PBP_PERIODICITY_ANNUALIZATION_FACTORS } from './ma-benefits.mjs';
import { visionEyewearAnnualValue } from './vision-usage.mjs';
import { VISION_WEIGHTS_PROGRESSIVE } from './vision-hearing-scoring-constants.mjs';
import { VISION_WEIGHTS } from './vision-hearing-scoring-constants.mjs';
import { interpolateCurve } from './vision-hearing-scoring-constants.mjs';
import { VISION_EYEWEAR_CURVE } from './vision-hearing-scoring-constants.mjs';
import { VISION_BOTH_EYEWEAR_MULTIPLIER } from './vision-hearing-scoring-constants.mjs';
import { VISION_EXAM_NEUTRAL } from './vision-hearing-scoring-constants.mjs';
import { VISION_EXAM_COINS_WORST_PCT } from './vision-hearing-scoring-constants.mjs';
import { VISION_EXAM_WORST } from './vision-hearing-scoring-constants.mjs';
import { VISION_EXAM_BANDS } from './vision-hearing-scoring-constants.mjs';
import { VISION_RICHNESS } from './vision-hearing-scoring-constants.mjs';
import { VISION_ACCESS } from './vision-hearing-scoring-constants.mjs';
import { ladderPoints } from './vision-hearing-scoring-constants.mjs';
import { VISION_PREFERENCE_LADDER } from './vision-hearing-scoring-constants.mjs';
import { VISION_PREFERENCE_FLOOR } from './vision-hearing-scoring-constants.mjs';
export function annualizationFactor(code) {
    if (code === null || code === '')
        return { factor: 1, flagged: true };
    const factor = PBP_PERIODICITY_ANNUALIZATION_FACTORS[code];
    if (factor === undefined)
        return { factor: 1, flagged: true };
    return { factor, flagged: code === '6' };
}
export function deriveAnnualizedEyewearCapacity(inputs) {
    if (!inputs.eyewearCovered)
        return { capacity: null, basis: null, flags: [] };
    const flags = [];
    if (inputs.combinedMax && inputs.combinedMax.amount > 0) {
        const { factor, flagged } = annualizationFactor(inputs.combinedMax.periodicityCode);
        if (flagged)
            flags.push('periodicity_other');
        return { capacity: round2(inputs.combinedMax.amount * factor), basis: 'combined', flags };
    }
    const items = inputs.perItemMaxes.filter((item) => item.amount > 0);
    if (items.length > 0) {
        let sum = 0;
        for (const item of items) {
            const { factor, flagged } = annualizationFactor(item.periodicityCode);
            if (flagged)
                flags.push('periodicity_other');
            sum += item.amount * factor;
        }
        return { capacity: round2(sum), basis: 'per_item', flags };
    }
    return { capacity: null, basis: null, flags };
}
export function scoreVisionBenefitQuality(inputs, profile = null) {
    if (!inputs.examCovered && !inputs.eyewearCovered)
        return null;
    const derived = deriveAnnualizedEyewearCapacity(inputs);
    const flags = [...derived.flags];
    let effective = derived.capacity;
    if (derived.capacity !== null && profile?.replacement_cadence) {
        const filed = derived.basis === 'per_item'
            ? inputs.perItemMaxes.filter((item) => item.amount > 0)
            : inputs.combinedMax && inputs.combinedMax.amount > 0 ? [inputs.combinedMax] : [];
        effective = round2(filed.reduce((sum, item) => sum + visionEyewearAnnualValue({
            perPeriodAllowance: item.amount,
            planPeriodsPerYear: annualizationFactor(item.periodicityCode).factor,
            profile,
        }), 0));
    }
    const weights = profile?.lens_type === 'progressive' ? VISION_WEIGHTS_PROGRESSIVE : VISION_WEIGHTS;
    let eyewear = 0;
    if (inputs.eyewearCovered && effective !== null && effective > 0) {
        eyewear = interpolateCurve(VISION_EYEWEAR_CURVE, effective);
        if (profile?.wears === 'both')
            eyewear *= VISION_BOTH_EYEWEAR_MULTIPLIER;
        eyewear = Math.min(VISION_WEIGHTS.eyewear, eyewear);
    }
    const examRaw = scoreVisionExam(inputs);
    const exam = examRaw * (weights.exam / VISION_WEIGHTS.exam);
    const contactsWearer = profile?.wears === 'contacts' || profile?.wears === 'both';
    let richnessRaw = VISION_RICHNESS.base;
    if (inputs.richness.lensMenu) {
        richnessRaw += VISION_RICHNESS.lensMenu;
        if (inputs.richness.progressivesAtZeroTier)
            richnessRaw += VISION_RICHNESS.progressivesAtZeroTier;
    }
    if (inputs.richness.coatings)
        richnessRaw += VISION_RICHNESS.coatings;
    if (inputs.richness.contactsVariety)
        richnessRaw += VISION_RICHNESS.contactsVariety;
    if (inputs.richness.upgradeDetail || inputs.richness.upgradesFlagPbp)
        richnessRaw += VISION_RICHNESS.upgrades;
    if (inputs.richness.contactFitting && contactsWearer)
        richnessRaw += VISION_RICHNESS.contactFitting;
    const richness = Math.min(VISION_WEIGHTS.richness, richnessRaw) * (weights.richness / VISION_WEIGHTS.richness);
    let access = VISION_ACCESS.start;
    if (inputs.access?.deductibleFiled)
        access += VISION_ACCESS.deductibleFiled;
    if (inputs.access?.noOonReimbursement)
        access += VISION_ACCESS.noOonReimbursement;
    if (inputs.access?.referralRequired)
        access += VISION_ACCESS.referralRequired;
    access = Math.max(0, access);
    const qualityScore = Math.max(0, Math.min(100, Math.round(eyewear + exam + richness + access)));
    const tier = inputs.eyewearCovered ? 'full' : 'limited_exam_only';
    return {
        tier,
        preferencePoints: ladderPoints(VISION_PREFERENCE_LADDER, VISION_PREFERENCE_FLOOR, qualityScore),
        qualityScore,
        annualizedEyewearCapacity: derived.capacity,
        capacityBasis: derived.basis,
        effectiveEyewearCapacity: effective,
        components: {
            eyewear: round2(eyewear), exam: round2(exam), richness: round2(richness), access,
        },
        flags,
    };
}
export function scoreVisionExam(inputs) {
    if (!inputs.examCovered)
        return 0;
    const coins = inputs.examCoinsurancePct;
    if (inputs.examCopay === null && coins === null)
        return VISION_EXAM_NEUTRAL;
    if (coins !== null && coins > VISION_EXAM_COINS_WORST_PCT)
        return VISION_EXAM_WORST;
    if (inputs.examCopay === null)
        return VISION_EXAM_NEUTRAL;
    for (const { maxCopay, points } of VISION_EXAM_BANDS) {
        if (inputs.examCopay <= maxCopay)
            return points;
    }
    return VISION_EXAM_WORST;
}
export function round2(value) {
    return Math.round(value * 100) / 100;
}
