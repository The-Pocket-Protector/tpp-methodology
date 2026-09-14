import { sharedDentalScopeFor } from './flex-card-shared-pool.mjs';
import { extractSupplementalBenefits } from './ma-benefits.mjs';
import { hasMeaningfulCoverage } from './ma-benefits.mjs';
import { PROCEDURE_UCR } from './dental-scoring-constants.mjs';
import { CATEGORY } from './dental-scoring-constants.mjs';
import { CATEGORY_WEIGHTS } from './dental-scoring-constants.mjs';
import { OOP_SCORE_THRESHOLDS } from './dental-scoring-constants.mjs';
import { OOP_SCORE_FALLBACK } from './dental-scoring-constants.mjs';
import { TEMPORAL_LIMIT_MAX_SCORE } from './dental-scoring-constants.mjs';
import { MAX_BENEFIT_FALLBACK } from './dental-scoring-constants.mjs';
import { MAX_BENEFIT_THRESHOLDS } from './dental-scoring-constants.mjs';
import { BREADTH_POINTS } from './dental-scoring-constants.mjs';
import { PREVENTIVE_BONUS } from './dental-scoring-constants.mjs';
import { COMPOSITE_WEIGHTS } from './dental-scoring-constants.mjs';
import { REALIZED_VALUE } from './dental-scoring-constants.mjs';
import { PBP_PERIODICITY_ANNUALIZATION_FACTORS } from './ma-benefits.mjs';
import { scoreVisionBenefitQuality } from './vision-scoring-service.mjs';
import { extractVisionScoringInputs } from './vh-benefit-extraction.mjs';
import { extractVisionAllowanceAmount } from './ma-benefits.mjs';
import { scoreHearingBenefitQuality } from './hearing-scoring-service.mjs';
import { extractHearingScoringInputs } from './vh-benefit-extraction.mjs';
import { hasWorldwideCoverage } from './ma-benefits.mjs';
import { hasVbidBenefit } from './ma-benefits.mjs';
import { QUALITY_BONUS_MAX_BY_BENEFIT } from './vision-hearing-scoring-constants.mjs';
export const QUALITY_SCORED_MATCH_FLOOR = 0.4;
export const QUALITY_BONUS_PER_BENEFIT_MAX = 15;
export function scoreSupplementalBenefits({ plan, benefitDetailsMap, dentalBenefitsMap, vbidMap, dvhScoringMirrorMap = new Map(), hearingTierCopaysMap = new Map(), requestedBenefits, visionProfile = null, }) {
    let benefitsScore = 50;
    const keyBenefits = [];
    const matchedRequestedBenefits = [];
    let supplementalBenefits = {};
    const benefitPreferenceScores = {};
    const benefitQualityScores = {};
    const benefitPreferenceTiers = {};
    const benefitCostSharingModels = {};
    const benefitMaxAmounts = {};
    const benefitFirstDollar = {};
    const benefitProcedureEstimates = {};
    const benefitRealizedValues = {};
    {
        try {
            const planKey = `${plan.contract_id}|${plan.plan_id}|${plan.segment_id || '0'}`;
            const bdMap = benefitDetailsMap.get(planKey) || { get: () => undefined };
            const dentalRows = dentalBenefitsMap.get(planKey) || [];
            const vbidData = vbidMap.get(planKey);
            const sharedPool = sharedDentalScopeFor(plan.contract_id, plan.plan_id);
            supplementalBenefits = extractSupplementalBenefits({
                benefitDetails: bdMap,
                dentalRows: dentalRows,
                vbidData,
                sharedPool,
            });
            const dentalQuality = scoreDentalBenefitQuality(dentalRows, bdMap);
            const hasDentalCoverage = dentalQuality.preferencePoints > -40
                || Boolean(supplementalBenefits.dental)
                || hasMeaningfulCoverage(bdMap.get('16b'))
                || hasMeaningfulCoverage(bdMap.get('16c'));
            if (hasDentalCoverage) {
                keyBenefits.push('dental');
                benefitPreferenceScores.dental = dentalQuality.preferencePoints;
                benefitQualityScores.dental = dentalQuality.qualityScore;
                benefitPreferenceTiers.dental = dentalQuality.tier;
                benefitCostSharingModels.dental = dentalQuality.costSharingModel;
                benefitFirstDollar.dental = dentalQuality.isFirstDollar;
                benefitProcedureEstimates.dental = dentalQuality.procedureEstimates;
                benefitMaxAmounts.dental = { annual: dentalQuality.maxBenefitAnnualized, unlimited: dentalQuality.maxBenefitUnlimited };
                if (dentalQuality.realizedValue !== null)
                    benefitRealizedValues.dental = dentalQuality.realizedValue;
            }
            const mirrorRow = dvhScoringMirrorMap.get(planKey) ?? null;
            const visionQuality = scoreVisionBenefitQuality(extractVisionScoringInputs(bdMap, mirrorRow), visionProfile);
            const hasVision = visionQuality !== null
                || Boolean(supplementalBenefits.vision) || hasMeaningfulCoverage(bdMap.get('17a')) || hasMeaningfulCoverage(bdMap.get('17b'));
            if (hasVision) {
                keyBenefits.push('vision');
                if (visionQuality !== null) {
                    benefitPreferenceScores.vision = visionQuality.preferencePoints;
                    benefitQualityScores.vision = visionQuality.qualityScore;
                    benefitPreferenceTiers.vision = visionQuality.tier;
                }
                const visionAllowance = extractVisionAllowanceAmount(bdMap);
                const visionAllowanceIsSharedPot = sharedPool != null && visionAllowance === sharedPool.dental_pot;
                if (visionAllowance !== null && visionAllowance > 0 && !visionAllowanceIsSharedPot) {
                    benefitRealizedValues.vision = Math.round(visionAllowance * REALIZED_VALUE.visionFlatMultiplier);
                }
            }
            const hearingQuality = scoreHearingBenefitQuality(extractHearingScoringInputs(bdMap, mirrorRow, hearingTierCopaysMap.get(planKey) ?? []));
            const hasHearing = hearingQuality !== null
                || Boolean(supplementalBenefits.hearing) || hasMeaningfulCoverage(bdMap.get('18b')) || hasMeaningfulCoverage(bdMap.get('18c'));
            if (hasHearing) {
                keyBenefits.push('hearing');
                if (hearingQuality !== null) {
                    benefitPreferenceScores.hearing = hearingQuality.preferencePoints;
                    benefitQualityScores.hearing = hearingQuality.qualityScore;
                    benefitPreferenceTiers.hearing = hearingQuality.tier;
                }
            }
            if (hasMeaningfulCoverage(bdMap.get('14c4')))
                keyBenefits.push('fitness');
            if (hasMeaningfulCoverage(bdMap.get('7j')))
                keyBenefits.push('telehealth');
            if (hasMeaningfulCoverage(bdMap.get('13a')))
                keyBenefits.push('acupuncture');
            if (hasMeaningfulCoverage(bdMap.get('13c')))
                keyBenefits.push('meal-delivery');
            if (hasWorldwideCoverage(bdMap))
                keyBenefits.push('worldwide-coverage');
            if (hasVbidBenefit(vbidData, ['10b1', '13i4']))
                keyBenefits.push('transportation');
            if (supplementalBenefits.otc || hasVbidBenefit(vbidData, ['14c8']))
                keyBenefits.push('otc');
        }
        catch (_e) { }
    }
    const nonQualityScoredKeyBenefits = keyBenefits.filter((benefit) => !(benefit in benefitQualityScores));
    if (requestedBenefits.length > 0) {
        const benefitSet = new Set(keyBenefits);
        const requestedKnownBenefits = requestedBenefits.filter((benefit) => benefitSet.has(benefit));
        if (requestedKnownBenefits.length > 0) {
            matchedRequestedBenefits.push(...requestedKnownBenefits);
            const qualityWeightedMatch = requestedKnownBenefits.reduce((sum, benefit) => sum + qualityMatchCredit(benefit, benefitQualityScores), 0);
            const requestedRatio = qualityWeightedMatch / requestedBenefits.length;
            benefitsScore = Math.max(10, Math.round(25 + requestedRatio * 75));
        }
        else if (keyBenefits.length > 0) {
            benefitsScore = Math.min(50, 30 + Math.min(nonQualityScoredKeyBenefits.length * 3, 20));
        }
    }
    else {
        benefitsScore += Math.min(nonQualityScoredKeyBenefits.length * 5, 30);
        for (const [benefit, qualityScore] of Object.entries(benefitQualityScores)) {
            const bonusMax = QUALITY_BONUS_MAX_BY_BENEFIT[benefit] ?? QUALITY_BONUS_PER_BENEFIT_MAX;
            benefitsScore += Math.round((qualityScore / 100) * bonusMax);
        }
    }
    benefitsScore = Math.min(benefitsScore, 100);
    return {
        benefitsScore,
        keyBenefits,
        matchedRequestedBenefits,
        supplementalBenefits,
        benefitPreferenceScores,
        benefitQualityScores,
        benefitPreferenceTiers,
        benefitCostSharingModels,
        benefitFirstDollar,
        benefitProcedureEstimates,
        benefitRealizedValues,
        benefitMaxAmounts,
    };
}
export function qualityMatchCredit(benefit, benefitQualityScores) {
    const qualityScore = benefitQualityScores[benefit];
    if (qualityScore == null)
        return 1.0;
    return QUALITY_SCORED_MATCH_FLOOR + (1 - QUALITY_SCORED_MATCH_FLOOR) * (qualityScore / 100);
}
export function emptyDentalResult() {
    return {
        tier: 'none',
        preferencePoints: -40,
        qualityScore: 0,
        costSharingModel: 'none',
        isFirstDollar: false,
        procedureEstimates: null,
        maxBenefitAmount: null,
        maxBenefitAnnualized: null,
        maxBenefitUnlimited: false,
        avgCoinsurancePct: null,
        realizedValue: null,
        realizedValueMultiplier: null,
        components: { procedureCost: 0, maxBenefit: 0, breadth: 0, access: 0, preventive: 0 },
    };
}
export function scoreDentalBenefitQuality(dentalRows = [], benefitDetails = { get: () => undefined }) {
    const rows = Array.isArray(dentalRows) ? dentalRows : [];
    const hasPreventiveFromDetails = hasMeaningfulCoverage(benefitDetails.get?.('16b'));
    const hasComprehensiveFromDetails = hasMeaningfulCoverage(benefitDetails.get?.('16c'));
    const hasRows = rows.length > 0;
    const hasPreventive = hasPreventiveFromDetails || rows.some(isPreventiveDentalRow);
    const hasComprehensive = hasComprehensiveFromDetails || rows.some(isComprehensiveDentalRow);
    if (!hasPreventive && !hasComprehensive && !hasRows)
        return emptyDentalResult();
    const comprehensiveRows = rows.filter(isComprehensiveDentalRow);
    const rowsByCategory = groupByCategoryCode(comprehensiveRows);
    const costSharingModel = detectCostSharingModel(comprehensiveRows, rowsByCategory);
    const procedureCost = scoreProcedureCost(rowsByCategory, costSharingModel);
    const maxBenefit = scoreMaxBenefit(rows, rowsByCategory, costSharingModel);
    const breadth = scoreCoverageBreadth(rowsByCategory);
    const access = scoreAccess(rows);
    const preventiveBonus = hasPreventive ? PREVENTIVE_BONUS : 0;
    const weights = (costSharingModel === 'coinsurance' || costSharingModel === 'zero_copay')
        ? COMPOSITE_WEIGHTS.maxDominant
        : COMPOSITE_WEIGHTS.costDominant;
    const qualityScore = Math.max(0, Math.min(100, Math.round(procedureCost.score * weights.cost
        + maxBenefit * weights.max
        + breadth * weights.breadth
        + access * weights.access
        + preventiveBonus)));
    const isFirstDollar = costSharingModel === 'zero_copay' && procedureCost.score >= 90;
    const tier = pickTier({ hasComprehensive, costSharingModel, procedureCostScore: procedureCost.score, isFirstDollar });
    const preferencePoints = !hasComprehensive ? 20
        : qualityScore >= 80 ? 45
            : qualityScore >= 60 ? 35
                : qualityScore >= 40 ? 25
                    : qualityScore >= 20 ? 15
                        : 5;
    const maxBenefitAmount = getMaxBenefitAmount(rows);
    const avgCoinsurancePct = averageCoinsurancePercent(comprehensiveRows);
    const realized = computeDentalRealizedValue({
        costSharingModel,
        maxBenefitAmount,
        avgCoinsurancePct,
        hasUnlimited: hasUnlimitedFlag(rows),
    });
    return {
        tier,
        preferencePoints,
        qualityScore,
        costSharingModel,
        isFirstDollar,
        procedureEstimates: procedureCost.estimates,
        maxBenefitAmount,
        maxBenefitAnnualized: getMaxBenefitAnnualized(comprehensiveRows),
        maxBenefitUnlimited: hasUnlimitedFlag(comprehensiveRows),
        avgCoinsurancePct,
        realizedValue: realized.value,
        realizedValueMultiplier: realized.multiplier,
        components: {
            procedureCost: procedureCost.score,
            maxBenefit,
            breadth,
            access,
            preventive: preventiveBonus,
        },
    };
}
export function computeDentalRealizedValue({ costSharingModel, maxBenefitAmount, avgCoinsurancePct, hasUnlimited, }) {
    const excluded = { value: null, multiplier: null };
    if (costSharingModel !== 'zero_copay' && costSharingModel !== 'coinsurance' && costSharingModel !== 'mixed') {
        return excluded;
    }
    if (hasUnlimited)
        return excluded;
    if (maxBenefitAmount === null || maxBenefitAmount <= 0)
        return excluded;
    if (maxBenefitAmount > REALIZED_VALUE.maxPlausibleDentalMax)
        return excluded;
    let multiplier;
    if (costSharingModel === 'zero_copay') {
        multiplier = 1.0;
    }
    else if (avgCoinsurancePct === null) {
        multiplier = REALIZED_VALUE.coinsuranceFallbackMultiplier;
    }
    else {
        multiplier = Math.max(REALIZED_VALUE.minCoinsuranceMultiplier, 1 - (avgCoinsurancePct / REALIZED_VALUE.coinsuranceDivisor));
    }
    return { value: Math.round(maxBenefitAmount * multiplier), multiplier };
}
export function averageCoinsurancePercent(comprehensiveRows) {
    const pcts = comprehensiveRows.map(getCoinsurancePercent).filter((value) => value !== null);
    if (!pcts.length)
        return null;
    return pcts.reduce((a, b) => a + b, 0) / pcts.length;
}
export function pickTier({ hasComprehensive, costSharingModel, procedureCostScore, isFirstDollar, }) {
    if (!hasComprehensive)
        return 'preventive_only';
    if (isFirstDollar)
        return 'first_dollar';
    if (costSharingModel === 'temporal_limit')
        return 'temporal_limit';
    if (procedureCostScore >= 60)
        return 'comprehensive_low_cost';
    return 'comprehensive_high_cost';
}
export function detectCostSharingModel(comprehensiveRows, rowsByCategory) {
    if (!comprehensiveRows.length)
        return 'unknown';
    const copays = comprehensiveRows
        .map(getCopayAmount)
        .filter((value) => value !== null);
    const coins = comprehensiveRows
        .map(getCoinsurancePercent)
        .filter((value) => value !== null);
    const hasCopay = copays.length > 0;
    const hasCoins = coins.length > 0;
    const allZeroCopay = hasCopay && copays.every((value) => value === 0);
    if (allZeroCopay && !hasCoins) {
        const maxAmount = getMaxBenefitAmount(comprehensiveRows);
        const unlimited = hasUnlimitedFlag(comprehensiveRows);
        if (maxAmount === null && !unlimited)
            return 'temporal_limit';
        return 'zero_copay';
    }
    if (hasCopay && hasCoins)
        return 'mixed';
    if (hasCopay)
        return 'copay';
    if (hasCoins)
        return 'coinsurance';
    const anyCategoryCovered = Object.keys(rowsByCategory).length > 0;
    return anyCategoryCovered ? 'unknown' : 'unknown';
}
export function scoreProcedureCost(rowsByCategory, costSharingModel) {
    if (costSharingModel === 'unknown') {
        return { score: 40, estimates: null };
    }
    const estimates = {
        crown: estimateOop(rowsByCategory[CATEGORY.CROWNS]?.[0], costSharingModel, CATEGORY.CROWNS),
        rootCanal: estimateOop(rowsByCategory[CATEGORY.ENDO]?.[0], costSharingModel, CATEGORY.ENDO),
        denture: estimateOop(rowsByCategory[CATEGORY.PROSTHO]?.[0], costSharingModel, CATEGORY.PROSTHO),
        perio: estimateOop(rowsByCategory[CATEGORY.PERIO]?.[0], costSharingModel, CATEGORY.PERIO),
        extraction: estimateOop(rowsByCategory[CATEGORY.EXTRACTIONS]?.[0], costSharingModel, CATEGORY.EXTRACTIONS),
    };
    let totalWeight = 0;
    let weightedScore = 0;
    for (const [code, weight] of Object.entries(CATEGORY_WEIGHTS)) {
        const row = rowsByCategory[code]?.[0];
        if (!row)
            continue;
        const oop = estimateOop(row, costSharingModel, code);
        if (oop === null)
            continue;
        weightedScore += scoreOop(oop) * (weight ?? 0);
        totalWeight += weight ?? 0;
    }
    const score = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 40;
    return { score, estimates };
}
export function estimateOop(row, costSharingModel, categoryCode) {
    if (!row)
        return null;
    if (row.cost_share_suppressed === true)
        return null;
    if (costSharingModel === 'zero_copay' || costSharingModel === 'temporal_limit') {
        return 0;
    }
    if (costSharingModel === 'copay' || costSharingModel === 'mixed') {
        const copay = getCopayAmount(row);
        const masksCoinsurance = costSharingModel === 'mixed' && copay === 0 && getCoinsurancePercent(row) !== null;
        if (copay !== null && !masksCoinsurance)
            return copay;
    }
    if (costSharingModel === 'coinsurance' || costSharingModel === 'mixed') {
        const pct = getCoinsurancePercent(row);
        if (pct === null)
            return null;
        const ucr = PROCEDURE_UCR[categoryCode];
        if (!ucr)
            return null;
        return Math.round((pct / 100) * ucr);
    }
    return null;
}
export function scoreOop(oop) {
    for (const { maxOop, score } of OOP_SCORE_THRESHOLDS) {
        if (oop <= maxOop)
            return score;
    }
    return OOP_SCORE_FALLBACK;
}
export function scoreMaxBenefit(allRows, rowsByCategory, costSharingModel) {
    if (costSharingModel === 'temporal_limit') {
        const categoryCount = Object.keys(rowsByCategory).length;
        if (categoryCount >= TEMPORAL_LIMIT_MAX_SCORE.fullSuite.minCategories) {
            return TEMPORAL_LIMIT_MAX_SCORE.fullSuite.score;
        }
        if (categoryCount >= TEMPORAL_LIMIT_MAX_SCORE.partial.minCategories) {
            return TEMPORAL_LIMIT_MAX_SCORE.partial.score;
        }
        return TEMPORAL_LIMIT_MAX_SCORE.narrow;
    }
    if (hasUnlimitedFlag(allRows))
        return 100;
    const maxAmount = getMaxBenefitAmount(allRows);
    if (maxAmount === null)
        return MAX_BENEFIT_FALLBACK;
    let effectiveCapacity = maxAmount;
    if (costSharingModel === 'coinsurance' || costSharingModel === 'mixed') {
        const compRows = allRows.filter(isComprehensiveDentalRow);
        const coinPcts = compRows.map(getCoinsurancePercent).filter((value) => value !== null);
        if (coinPcts.length > 0) {
            const avgCoinsurance = coinPcts.reduce((a, b) => a + b, 0) / coinPcts.length;
            const planPaidPct = (100 - avgCoinsurance) / 100;
            if (planPaidPct > 0)
                effectiveCapacity = maxAmount / planPaidPct;
        }
    }
    for (const { min, score } of MAX_BENEFIT_THRESHOLDS) {
        if (effectiveCapacity >= min)
            return score;
    }
    return MAX_BENEFIT_FALLBACK;
}
export function scoreCoverageBreadth(rowsByCategory) {
    let score = 0;
    for (const [code, points] of Object.entries(BREADTH_POINTS)) {
        if (rowsByCategory[code]?.length)
            score += points;
    }
    return Math.min(score, 100);
}
export function scoreAccess(rows) {
    if (!rows.length)
        return 0;
    let score = 50;
    if (!hasDeductible(rows))
        score += 15;
    if (!requiresPriorAuth(rows))
        score += 10;
    if (hasOonCoverage(rows))
        score += 15;
    if (hasUnlimitedFlag(rows) || maxVisits(rows) >= 2)
        score += 10;
    return Math.min(score, 100);
}
export function isPreventiveDentalRow(row) {
    const text = dentalRowText(row);
    return text.includes('preventive') || text.includes('16b');
}
export function isComprehensiveDentalRow(row) {
    const text = dentalRowText(row);
    return text.includes('comprehensive') || text.includes('16c');
}
export function groupByCategoryCode(rows) {
    const groups = {};
    for (const row of rows) {
        const code = normalizeCategoryCode(row?.category_code ?? row?.categoryCode);
        if (!code)
            continue;
        if (!groups[code])
            groups[code] = [];
        groups[code].push(row);
    }
    return groups;
}
export function normalizeCategoryCode(raw) {
    if (raw === null || raw === undefined)
        return null;
    const text = String(raw).trim().toLowerCase();
    if (!text)
        return null;
    const match = text.match(/16c\d+/);
    return match ? match[0] : null;
}
export function dentalRowText(row) {
    return [
        row?.benefit_area,
        row?.benefitArea,
        row?.category_code,
        row?.categoryCode,
        row?.service_category,
        row?.serviceCategory,
        row?.benefit_name,
        row?.benefitName,
        row?.description,
    ].map((value) => String(value ?? '').toLowerCase()).join(' ');
}
export function getCopayAmount(row) {
    const direct = numberValue(firstPresentValue(row, ['copay_amount', 'copayAmount']));
    if (direct !== null)
        return direct;
    const max = numberValue(firstPresentValue(row, ['copay_max_amount', 'copayMaxAmount']));
    if (max !== null)
        return max;
    const min = numberValue(firstPresentValue(row, ['copay_min_amount', 'copayMinAmount']));
    return min;
}
export function getCoinsurancePercent(row) {
    const raw = firstPresentValue(row, [
        'coinsurance_pct',
        'coinsurance_max_pct',
        'coinsurance_min_pct',
        'coinsurance_percent',
        'coinsurance',
        'member_coinsurance_pct',
        'memberCoinsurancePct',
    ]);
    const value = numberValue(raw);
    if (value === null)
        return null;
    return value > 0 && value <= 1 ? value * 100 : value;
}
export function getMaxBenefitAmount(rows) {
    const amounts = rows.map((row) => numberValue(firstPresentValue(row, [
        'plan_benefit_max_amount',
        'max_coverage_amount',
        'planBenefitMaxAmount',
        'maxCoverageAmount',
    ]))).filter((value) => value !== null && value > 0);
    if (!amounts.length)
        return null;
    return Math.max(...amounts);
}
export function getMaxBenefitAnnualized(rows) {
    const amounts = rows.map((row) => {
        const amount = numberValue(firstPresentValue(row, [
            'plan_benefit_max_amount',
            'max_coverage_amount',
            'planBenefitMaxAmount',
            'maxCoverageAmount',
        ]));
        if (amount === null || amount <= 0)
            return null;
        const periodicity = firstPresentValue(row, ['plan_benefit_periodicity', 'planBenefitPeriodicity']);
        const factor = PBP_PERIODICITY_ANNUALIZATION_FACTORS[String(periodicity ?? '')] ?? 1;
        return Math.round(amount * factor);
    }).filter((value) => value !== null);
    if (!amounts.length)
        return null;
    return Math.max(...amounts);
}
export function hasUnlimitedFlag(rows) {
    return rows.some((row) => isTruthyValue(firstPresentValue(row, [
        'benefit_unlimited_flag',
        'benefitUnlimitedFlag',
        'unlimited_flag',
    ])));
}
export function maxVisits(rows) {
    const visits = rows
        .map((row) => numberValue(firstPresentValue(row, ['num_visits', 'numVisits', 'visit_limit'])))
        .filter((value) => value !== null);
    return visits.length ? Math.max(...visits) : 0;
}
export function hasDeductible(rows) {
    return rows.some((row) => {
        const flag = isTruthyValue(firstPresentValue(row, ['deductible_flag', 'deductibleFlag']));
        const amount = numberValue(firstPresentValue(row, ['deductible_amount', 'deductibleAmount']));
        return flag && (amount === null || amount > 0);
    });
}
export function requiresPriorAuth(rows) {
    return rows.some((row) => isTruthyValue(firstPresentValue(row, ['prior_auth_required', 'priorAuthRequired'])));
}
export function hasOonCoverage(rows) {
    return rows.some((row) => {
        const copay = numberValue(firstPresentValue(row, ['oon_copayment', 'oonCopayment']));
        const coins = numberValue(firstPresentValue(row, ['oon_coinsurance', 'oonCoinsurance']));
        return (copay !== null && copay >= 0) || (coins !== null && coins >= 0 && coins < 100);
    });
}
export function firstPresentValue(row, fields) {
    for (const field of fields) {
        if (row && row[field] !== undefined && row[field] !== null && row[field] !== '')
            return row[field];
    }
    return null;
}
export function numberValue(value) {
    if (value === null || value === undefined || value === '')
        return null;
    const number = Number(String(value).replace(/[$,%]/g, ''));
    return Number.isFinite(number) ? number : null;
}
export function isTruthyValue(value) {
    const text = String(value ?? '').trim().toLowerCase();
    return ['1', 'y', 'yes', 'true'].includes(text);
}
