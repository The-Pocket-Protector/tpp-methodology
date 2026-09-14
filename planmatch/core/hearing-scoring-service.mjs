import { PBP_PERIODICITY_ANNUALIZATION_FACTORS } from './ma-benefits.mjs';
import { HEARING_COPAY_TIER_WORST } from './vision-hearing-scoring-constants.mjs';
import { HEARING_COPAY_TIER_BANDS } from './vision-hearing-scoring-constants.mjs';
import { HEARING_CEILING_MODIFIER } from './vision-hearing-scoring-constants.mjs';
import { HEARING_WEIGHTS } from './vision-hearing-scoring-constants.mjs';
import { interpolateCurve } from './vision-hearing-scoring-constants.mjs';
import { HEARING_ALLOWANCE_CURVE } from './vision-hearing-scoring-constants.mjs';
import { HEARING_VENDOR_NO_PRICE_AID } from './vision-hearing-scoring-constants.mjs';
import { HEARING_UNSPECIFIED_AID } from './vision-hearing-scoring-constants.mjs';
import { HEARING_EXTRAS_NEUTRAL } from './vision-hearing-scoring-constants.mjs';
import { HEARING_EXTRAS_POINTS } from './vision-hearing-scoring-constants.mjs';
import { HEARING_CADENCE_POINTS } from './vision-hearing-scoring-constants.mjs';
import { HEARING_CADENCE_NEUTRAL } from './vision-hearing-scoring-constants.mjs';
import { HEARING_EXAM_NEUTRAL } from './vision-hearing-scoring-constants.mjs';
import { HEARING_EXAM_BANDS } from './vision-hearing-scoring-constants.mjs';
import { HEARING_EXAM_WORST } from './vision-hearing-scoring-constants.mjs';
import { ladderPoints } from './vision-hearing-scoring-constants.mjs';
import { HEARING_PREFERENCE_LADDER } from './vision-hearing-scoring-constants.mjs';
import { HEARING_PREFERENCE_FLOOR } from './vision-hearing-scoring-constants.mjs';
export function deriveAnnualizedPairCapacity(inputs) {
    if (!inputs.aidsCovered || inputs.aidMax === null || inputs.aidMax <= 0) {
        return { capacity: null, flags: [] };
    }
    const flags = [];
    const pairMax = inputs.perearCode === 1 ? inputs.aidMax * 2 : inputs.aidMax;
    const code = inputs.maxPeriodicityCode;
    let factor = 1;
    if (code === null || code === '') {
        flags.push('max_periodicity_unfiled');
    }
    else {
        const mapped = PBP_PERIODICITY_ANNUALIZATION_FACTORS[code];
        if (mapped === undefined)
            flags.push('max_periodicity_unknown');
        else {
            factor = mapped;
            if (code === '6')
                flags.push('periodicity_other');
        }
    }
    return { capacity: round2(pairMax * factor), flags };
}
export function scoreHearingBenefitQuality(inputs) {
    if (!inputs.examCovered && !inputs.aidsCovered)
        return null;
    const derived = inputs.mirrorPairCapacity !== undefined && inputs.mirrorPairCapacity !== null
        ? { capacity: inputs.mirrorPairCapacity, flags: [] }
        : deriveAnnualizedPairCapacity(inputs);
    const flags = [...derived.flags];
    const disclosures = [];
    const aid = scoreAidValue(inputs, derived.capacity, disclosures, flags);
    let extras;
    if (inputs.extras.noData) {
        extras = HEARING_EXTRAS_NEUTRAL;
    }
    else {
        extras = 0;
        if (inputs.extras.batteries)
            extras += HEARING_EXTRAS_POINTS.batteries;
        if (inputs.extras.trial)
            extras += HEARING_EXTRAS_POINTS.trial;
        if (inputs.extras.rechargeable)
            extras += HEARING_EXTRAS_POINTS.rechargeable;
        if (inputs.extras.otcAids)
            extras += HEARING_EXTRAS_POINTS.otcAids;
        if (inputs.extras.followUp)
            extras += HEARING_EXTRAS_POINTS.followUp;
        if (inputs.extras.warranty)
            extras += HEARING_EXTRAS_POINTS.warranty;
        extras = Math.min(HEARING_WEIGHTS.extras, extras);
    }
    const cadence = inputs.aidsCovered
        ? (inputs.aidsPeriodicityCode !== null && HEARING_CADENCE_POINTS[inputs.aidsPeriodicityCode] !== undefined
            ? HEARING_CADENCE_POINTS[inputs.aidsPeriodicityCode]
            : HEARING_CADENCE_NEUTRAL)
        : 0;
    const exam = scoreHearingExam(inputs);
    const qualityScore = Math.max(0, Math.min(100, Math.round(aid.points + extras + cadence + exam)));
    const tier = inputs.aidsCovered ? 'full' : 'limited_exam_only';
    return {
        tier,
        preferencePoints: ladderPoints(HEARING_PREFERENCE_LADDER, HEARING_PREFERENCE_FLOOR, qualityScore),
        qualityScore,
        annualizedPairCapacity: derived.capacity,
        entryPairOop: aid.entryPairOop,
        aidPath: aid.path,
        disclosures,
        components: { aid: round2(aid.points), extras, cadence, exam },
        flags,
    };
}
export function scoreAidValue(inputs, pairCapacity, disclosures, flags) {
    if (!inputs.aidsCovered)
        return { points: 0, path: 'none', entryPairOop: null };
    const entryPerAid = inputs.entryTierCopay;
    const entryPairOop = entryPerAid !== null ? entryPerAid * 2 : null;
    const model = inputs.benefitModel;
    const copayPath = (pairOop) => {
        let points = HEARING_COPAY_TIER_WORST;
        for (const { maxPairOop, points: bandPoints } of HEARING_COPAY_TIER_BANDS) {
            if (pairOop <= maxPairOop) {
                points = bandPoints;
                break;
            }
        }
        const ceiling = inputs.topTierCopay;
        if (ceiling !== null) {
            if (ceiling <= HEARING_CEILING_MODIFIER.richMax)
                points += HEARING_CEILING_MODIFIER.bonus;
            else if (ceiling > HEARING_CEILING_MODIFIER.poorMin)
                points += HEARING_CEILING_MODIFIER.penalty;
        }
        return Math.max(0, Math.min(HEARING_WEIGHTS.aid, points));
    };
    const allowancePath = () => (pairCapacity === null || pairCapacity <= 0
        ? 0
        : Math.min(HEARING_WEIGHTS.aid, interpolateCurve(HEARING_ALLOWANCE_CURVE, pairCapacity)));
    switch (model) {
        case 'copay_tier':
            if (entryPairOop === null) {
                flags.push('copay_tier_no_priced_rows');
                return { points: HEARING_VENDOR_NO_PRICE_AID, path: 'copay_tier', entryPairOop: null };
            }
            return { points: copayPath(entryPairOop), path: 'copay_tier', entryPairOop };
        case 'allowance':
            return { points: allowancePath(), path: 'allowance', entryPairOop: null };
        case 'allowance+copay_tier': {
            const copay = entryPairOop !== null ? copayPath(entryPairOop) : null;
            const allowance = allowancePath();
            const points = copay === null ? allowance : Math.min(copay, allowance);
            return { points, path: 'worse_binding', entryPairOop };
        }
        case 'vendor_program': {
            disclosures.push('vendor_program');
            if (entryPairOop !== null)
                return { points: copayPath(entryPairOop), path: 'vendor_priced', entryPairOop };
            if (inputs.aidCopayRangeMin !== undefined && inputs.aidCopayRangeMin !== null) {
                const rangeEntryPair = inputs.aidCopayRangeMin * 2;
                return { points: copayPath(rangeEntryPair), path: 'vendor_priced', entryPairOop: rangeEntryPair };
            }
            return { points: HEARING_VENDOR_NO_PRICE_AID, path: 'vendor_no_price', entryPairOop: null };
        }
        default:
            return { points: HEARING_UNSPECIFIED_AID, path: 'unspecified', entryPairOop: null };
    }
}
export function scoreHearingExam(inputs) {
    if (!inputs.examCovered)
        return 0;
    const filed = [inputs.examRoutineCopay, inputs.examFittingCopay]
        .filter((value) => value !== null);
    if (!filed.length)
        return HEARING_EXAM_NEUTRAL;
    const worst = Math.max(...filed);
    for (const { maxCopay, points } of HEARING_EXAM_BANDS) {
        if (worst <= maxCopay)
            return points;
    }
    return HEARING_EXAM_WORST;
}
export function round2(value) {
    return Math.round(value * 100) / 100;
}
