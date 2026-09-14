import { getEffectiveMonthlyPremiumValue } from './ma-plan-value.mjs';
import { getNetPlanAnnualCostAfterGivebackValue } from './ma-plan-value.mjs';
import { getNetAnnualExposureAfterGivebackValue } from './ma-plan-value.mjs';
import { isProviderCoverageWeightEnabled } from './provider-coverage-weight-flag.mjs';
import { roundMoney } from './ma-plan-value.mjs';
import { getMonthlyPremiumValue } from './ma-plan-value.mjs';
import { getPlanAnnualCostValue } from './ma-plan-value.mjs';
import { getPartBGivebackValue } from './ma-plan-value.mjs';
import { isEmployerCostComparisonEnabled } from './employer-cost-comparison-flag.mjs';
import { getAnnualCostValue } from './ma-plan-value.mjs';
export const NETWORK_FREEDOM_PLAN_TYPE_BOOST = 25;
export const COST_SIGNAL_WEIGHTS = {
    default: {
        effectivePremium: 75,
        annualCost: 25,
        moop: 55,
    },
    benefitPreferenceActive: {
        effectivePremium: 45,
        annualCost: 15,
        moop: 30,
    },
};
export function rankMaRecommendationsByUserPreferences(plans, parameters = {}) {
    const networkFreedomRequired = parameters.networkFreedomRequired === true
        || parameters.network_freedom_required === true;
    const valueContext = { hasMedicaid: parameters.hasMedicaid === true };
    const getEffectiveMonthlyPremium = (plan) => getEffectiveMonthlyPremiumValue(plan, valueContext);
    const getNetPlanAnnualCostAfterGiveback = (plan) => getNetPlanAnnualCostAfterGivebackValue(plan, valueContext);
    const getNetAnnualExposureAfterGiveback = (plan) => getNetAnnualExposureAfterGivebackValue(plan, valueContext);
    let candidates = (Array.isArray(plans) ? plans : [])
        .map((plan, index) => ({ plan, index }))
        .filter(({ plan }) => getMaRecommendationValidationIssues(plan, parameters).length === 0);
    if (networkFreedomRequired) {
        candidates = candidates.filter(({ plan }) => isNetworkFreedomHardFilterMatch(plan));
    }
    if (candidates.length === 0)
        return [];
    const healthProfile = getRecommendationHealthProfile(parameters);
    const benefitPreferences = normalizeBenefitPreferences(parameters.benefitPreferences ?? parameters.benefit_preferences);
    const costSignalWeights = benefitPreferences.length > 0
        ? COST_SIGNAL_WEIGHTS.benefitPreferenceActive
        : COST_SIGNAL_WEIGHTS.default;
    const premiumConcern = hasAny(parameters.costConcerns ?? parameters.cost_concerns, ['I could always pay less'])
        || hasAny(parameters.priorities ?? parameters.user_priorities, ['low-premium']);
    const oopConcern = hasAny(parameters.costConcerns ?? parameters.cost_concerns, ['Out-of-pocket max too high'])
        || hasAny(parameters.priorities ?? parameters.user_priorities, ['low-oop']);
    const deductibleConcern = hasAny(parameters.costConcerns ?? parameters.cost_concerns, ['Deductible too high']);
    const enteredDrugCount = countItems(parameters.drugs ?? parameters.medications);
    const drugConcern = enteredDrugCount > 0
        || hasAny(parameters.costConcerns ?? parameters.cost_concerns, ['Drug copays'])
        || hasAny(parameters.priorities ?? parameters.user_priorities, ['drug-coverage']);
    const doctorConcern = hasAny(parameters.planConcerns ?? parameters.plan_concerns, ['Network rules'])
        || hasAny(parameters.priorities ?? parameters.user_priorities, ['keep-doctors']);
    const referralConcern = hasAny(parameters.planConcerns ?? parameters.plan_concerns, ['Referrals']);
    const priorAuthConcern = hasAny(parameters.planConcerns ?? parameters.plan_concerns, ['Prior authorization']);
    const surpriseBillConcern = hasAny(parameters.planConcerns ?? parameters.plan_concerns, ['Surprise bills']);
    const customerServiceConcern = hasAny(parameters.planConcerns ?? parameters.plan_concerns, ['Customer service']);
    const financialPreferenceMode = getFinancialPreferenceMode({
        premiumConcern,
        oopConcern,
        hasEmployerPremium: getCurrentEmployerMonthlyPremiumValue(parameters) !== null,
    });
    const hasSelectedPreference = financialPreferenceMode !== 'none'
        || premiumConcern
        || oopConcern
        || deductibleConcern
        || drugConcern
        || doctorConcern
        || referralConcern
        || priorAuthConcern
        || surpriseBillConcern
        || customerServiceConcern
        || benefitPreferences.length > 0
        || ['moderate', 'high', 'very_high'].includes(healthProfile.utilization);
    if (!hasSelectedPreference)
        return candidates.map(({ plan }) => plan);
    const signalStatsCache = new Map();
    const statsFor = (getValue) => {
        let stats = signalStatsCache.get(getValue);
        if (!stats) {
            stats = computeSignalStats(candidates, getValue);
            signalStatsCache.set(getValue, stats);
        }
        return stats;
    };
    const scored = candidates.map((candidate) => {
        let score = 0;
        if (financialPreferenceMode === 'savings') {
            score += lowNumberScore(candidate.plan, statsFor, getNetPlanAnnualCostAfterGiveback, 100);
        }
        else if (financialPreferenceMode === 'net-exposure') {
            score += lowNumberScore(candidate.plan, statsFor, getNetAnnualExposureAfterGiveback, 100);
        }
        else if (financialPreferenceMode === 'oop') {
            if (isHighUtilization(healthProfile.utilization)) {
                score += lowNumberScore(candidate.plan, statsFor, getMoopValue, 100);
            }
            else {
                score += lowNumberScore(candidate.plan, statsFor, getNetAnnualExposureAfterGiveback, 75);
                score += lowNumberScore(candidate.plan, statsFor, getMoopValue, 25);
            }
        }
        if (premiumConcern) {
            score += lowNumberScore(candidate.plan, statsFor, getEffectiveMonthlyPremium, costSignalWeights.effectivePremium);
            score += lowNumberScore(candidate.plan, statsFor, getNetPlanAnnualCostAfterGiveback, costSignalWeights.annualCost);
        }
        if (oopConcern) {
            score += lowNumberScore(candidate.plan, statsFor, getMoopValue, costSignalWeights.moop);
        }
        if (deductibleConcern) {
            score += lowNumberScore(candidate.plan, statsFor, getDeductibleValue, 45);
        }
        if (drugConcern) {
            score += lowNumberScore(candidate.plan, statsFor, getDrugCostValue, 50);
            score += highNumberScore(candidate.plan, statsFor, getDrugCoverageRatio, 30);
        }
        if (benefitPreferences.length) {
            score += getBenefitPreferenceScore(candidate.plan, benefitPreferences);
        }
        if (doctorConcern) {
            score += highNumberScore(candidate.plan, statsFor, getDoctorNetworkRatio, 50);
            score += highNumberScore(candidate.plan, statsFor, getProviderScore, 20);
            score += getNetworkFreedomPlanTypeBoost(candidate.plan);
        }
        if (referralConcern) {
            score += lowNumberScore(candidate.plan, statsFor, getReferralBurdenValue, 35);
        }
        if (priorAuthConcern) {
            score += lowNumberScore(candidate.plan, statsFor, getPriorAuthBurdenValue, 35);
        }
        if (surpriseBillConcern) {
            score += highNumberScore(candidate.plan, statsFor, getSurpriseBillProtectionScore, 35);
        }
        if (customerServiceConcern) {
            score += highNumberScore(candidate.plan, statsFor, getCustomerServiceScore, 35);
        }
        score += matchedPriorityScore(candidate.plan, parameters.priorities ?? parameters.user_priorities);
        const savings = getEstimatedAnnualSavings(candidate.plan, valueContext, parameters);
        return {
            ...candidate,
            plan: attachRecommendationBasis(candidate.plan, score, savings, healthProfile),
            score,
            estimatedAnnualSavings: savings.estimatedAnnualSavings,
            netAnnualExposureAfterGiveback: savings.savingsComponents.net_annual_exposure_after_giveback,
        };
    });
    const careFitTotals = {
        totalDoctors: countItems(parameters.doctors ?? parameters.providers ?? parameters.physicians),
        totalDrugs: enteredDrugCount,
    };
    scored.sort((a, b) => compareCareFitCoverage(a.plan, b.plan, careFitTotals)
        || compareDrugEvidenceForDrugConcern(a.plan, b.plan, drugConcern)
        || compareDoctorEvidenceForDoctorConcern(a.plan, b.plan, doctorConcern)
        || compareBenefitPreferenceCoverage(a.plan, b.plan, benefitPreferences, valueContext)
        || compareReferralPreference(a.plan, b.plan, referralConcern, getEffectiveMonthlyPremium)
        || compareFinancialPreference(a, b, financialPreferenceMode, healthProfile.utilization, valueContext)
        || compareKnownMoopForHighUtilization(a.plan, b.plan, healthProfile.utilization, financialPreferenceMode === 'oop')
        || compareVeryHighMoopPrimary(a, b, healthProfile.utilization, financialPreferenceMode === 'oop')
        || (b.score - a.score)
        || compareHealthUtilizationMoopGuardrail(a, b, healthProfile.utilization, financialPreferenceMode === 'oop')
        || compareEstimatedAnnualSavings(a, b)
        || compareSavingsTieBreakers(a.plan, b.plan, valueContext)
        || compareRiskValueTieBreakers(a.plan, b.plan)
        || compareStablePlanIdentity(a.plan, b.plan));
    return scored.map(({ plan }) => plan);
}
export function getMaRecommendationValidationIssues(plan, parameters = {}) {
    const issues = [];
    if (!plan || typeof plan !== 'object')
        return ['missing_plan'];
    const planObj = plan;
    if (!textValue(planObj.contract_id))
        issues.push('missing_contract_id');
    if (!textValue(planObj.plan_id))
        issues.push('missing_plan_id');
    if (!textValue(planObj.plan_name || planObj.name))
        issues.push('missing_plan_name');
    if (!textValue(planObj.carrier || planObj.organization_marketing_name || planObj.organization_name))
        issues.push('missing_carrier');
    const premium = numberValue(planObj.monthly_premium);
    if (premium === null || premium < 0)
        issues.push('invalid_monthly_premium');
    const requestedPlanTypes = normalizeList(parameters.planTypes ?? parameters.plan_types);
    const planType = normalizeToken(planObj.plan_type || planObj.plan_type_label || planObj.type);
    if (requestedPlanTypes.length && planType && !requestedPlanTypes.some((requested) => planType.includes(requested))) {
        issues.push('plan_type_mismatch');
    }
    const enteredDrugCount = countItems(parameters.drugs ?? parameters.medications);
    const drugsTotal = numberValue(planObj.drugs_total);
    if (enteredDrugCount > 0 && drugsTotal !== null && drugsTotal < enteredDrugCount) {
        issues.push('drug_count_mismatch');
    }
    const enteredDoctorCount = countItems(parameters.doctors ?? parameters.providers ?? parameters.physicians);
    const doctorsTotal = numberValue(planObj.doctors_total);
    if (enteredDoctorCount > 0 && doctorsTotal !== null && doctorsTotal < enteredDoctorCount) {
        issues.push('doctor_count_mismatch');
    }
    return issues;
}
export const BENEFIT_PREFERENCE_TOKENS = ['dental', 'vision', 'hearing', 'fitness', 'otc', 'transportation', 'telehealth', 'meal-delivery', 'acupuncture', 'worldwide-coverage'];
export function normalizeBenefitPreferences(values) {
    return normalizeList(values)
        .map(normalizeBenefitToken)
        .filter((value) => BENEFIT_PREFERENCE_TOKENS.includes(value));
}
export function getMatchedMaBenefitPreferences(plan, benefitPreferences = []) {
    const evidence = getPlanBenefitEvidence(plan);
    return normalizeBenefitPreferences(benefitPreferences).filter((benefit) => evidence.has(benefit));
}
export function getBenefitPreferenceScore(plan, benefitPreferences = []) {
    const evidence = getPlanBenefitEvidence(plan);
    return normalizeBenefitPreferences(benefitPreferences).reduce((score, benefit) => {
        const explicitScore = getExplicitBenefitPreferenceScore(plan, benefit);
        if (explicitScore !== null)
            return score + explicitScore;
        return evidence.has(benefit) ? score + 35 : score;
    }, 0);
}
export function getExplicitBenefitPreferenceScore(plan, benefit) {
    const scores = plan?.benefit_preference_scores || plan?.benefitPreferenceScores;
    if (!scores || typeof scores !== 'object')
        return null;
    const value = numberValue(scores[benefit]);
    return value === null ? null : value;
}
export const PPO_PLAN_TYPE_VALUES = new Set([
    'ppo',
    'localppo',
    'regionalppo',
]);
export function isNetworkFreedomHardFilterMatch(plan) {
    const planType = normalizeToken(plan.plan_type || plan.plan_type_label || plan.type);
    return PPO_PLAN_TYPE_VALUES.has(planType);
}
export function getNetworkFreedomPlanTypeBoost(plan) {
    const planType = normalizeToken(plan.plan_type || plan.plan_type_label || plan.type);
    return planType.includes('ppo') || planType.includes('pffs') ? NETWORK_FREEDOM_PLAN_TYPE_BOOST : 0;
}
export function textValue(value) {
    return String(value ?? '').trim();
}
export function normalizeToken(value) {
    return textValue(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}
export function normalizeList(values) {
    return Array.from(new Set((Array.isArray(values) ? values : [])
        .map(normalizeBenefitToken)
        .filter(Boolean)));
}
export function normalizeBenefitToken(value) {
    const token = normalizeToken(value);
    if (!token)
        return '';
    if (token.includes('hearing'))
        return 'hearing';
    if (token.includes('fitness') || token.includes('gym'))
        return 'fitness';
    if (token.includes('otc') || token.includes('overcounter'))
        return 'otc';
    if (token.includes('dental'))
        return 'dental';
    if (token.includes('vision'))
        return 'vision';
    if (token.includes('transportation'))
        return 'transportation';
    if (token.includes('telehealth'))
        return 'telehealth';
    if (token.includes('mealdelivery') || token.includes('meal'))
        return 'meal-delivery';
    if (token.includes('acupuncture'))
        return 'acupuncture';
    if (token.includes('worldwidecoverage') || token.includes('worldwide'))
        return 'worldwide-coverage';
    if (token.includes('lowpremium'))
        return 'lowpremium';
    if (token.includes('lowoop') || token.includes('outofpocket'))
        return 'lowoop';
    if (token.includes('drugcoverage') || token.includes('drugcopay'))
        return 'drugcoverage';
    if (token.includes('keepdoctor') || token.includes('networkrule'))
        return 'keepdoctors';
    return token;
}
export function countItems(values) {
    return Array.isArray(values) ? values.filter(Boolean).length : 0;
}
export function numberValue(value) {
    if (value === null || value === undefined || value === '')
        return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}
export function hasAny(values, expected) {
    const normalizedValues = new Set(normalizeList(values));
    return expected.map(normalizeBenefitToken).some((value) => normalizedValues.has(value));
}
export function getFinancialPreferenceMode({ premiumConcern, oopConcern, hasEmployerPremium } = {}) {
    if (premiumConcern && oopConcern)
        return 'net-exposure';
    if (oopConcern)
        return 'oop';
    if (premiumConcern || hasEmployerPremium)
        return 'savings';
    return 'none';
}
export const planBenefitEvidenceCache = new WeakMap();
export function getPlanBenefitEvidence(plan) {
    if (!plan || typeof plan !== 'object')
        return new Set();
    const cached = planBenefitEvidenceCache.get(plan);
    if (cached)
        return cached;
    const evidence = computePlanBenefitEvidence(plan);
    planBenefitEvidenceCache.set(plan, evidence);
    return evidence;
}
export function computePlanBenefitEvidence(plan) {
    const evidence = new Set();
    const rawValues = [];
    if (Array.isArray(plan.key_benefits))
        rawValues.push(...plan.key_benefits);
    if (Array.isArray(plan.matched_priorities))
        rawValues.push(...plan.matched_priorities);
    if (plan.supplemental_benefits && typeof plan.supplemental_benefits === 'object') {
        rawValues.push(...Object.keys(plan.supplemental_benefits));
        rawValues.push(...Object.values(plan.supplemental_benefits));
    }
    if (plan.benefits && typeof plan.benefits === 'object') {
        rawValues.push(...Object.keys(plan.benefits));
        rawValues.push(...Object.values(plan.benefits));
    }
    rawValues.forEach((value) => {
        const raw = textValue(value);
        const normalized = normalizeBenefitToken(raw);
        BENEFIT_PREFERENCE_TOKENS.forEach((benefit) => {
            if (normalized === benefit || normalizeToken(raw).includes(normalizeToken(benefit))) {
                evidence.add(benefit);
            }
        });
    });
    return evidence;
}
export function getPremiumValue(plan) {
    return getMonthlyPremiumValue(plan);
}
export function getMoopValue(plan) {
    return numberValue(plan.moop ?? plan.moop_in_network);
}
export function getDeductibleValue(plan) {
    return numberValue(plan.annual_deductible);
}
export function getDrugCostValue(plan) {
    return numberValue(plan.estimated_annual_drug_cost);
}
export function getDrugCoverageRatio(plan) {
    const total = numberValue(plan.drugs_total);
    const covered = numberValue(plan.drugs_covered);
    if (total === null || covered === null || total <= 0)
        return null;
    return covered / total;
}
export function hasUnresolvedDoctors(plan) {
    const requirementUnknown = numberValue(plan.doctor_requirements_unknown);
    if (requirementUnknown !== null)
        return requirementUnknown > 0;
    const unknown = numberValue(plan.doctors_unknown);
    if (unknown !== null)
        return unknown > 0;
    return plan.doctor_network_verified !== true;
}
export function getDoctorCareCoverageCount(plan, totalDoctors) {
    if (!totalDoctors)
        return 0;
    if (!isProviderCoverageWeightEnabled() && hasUnresolvedDoctors(plan))
        return 0;
    const covered = (numberValue(plan.doctors_in_network) ?? 0)
        + (numberValue(plan.doctors_likely_in_network) ?? 0)
        + (numberValue(plan.doctors_covered_via_cross_reference) ?? 0);
    if (covered <= 0)
        return 0;
    return Math.min(covered, totalDoctors);
}
export function getDrugCareCoverageCount(plan, totalDrugs) {
    if (!totalDrugs)
        return 0;
    const covered = numberValue(plan.drugs_covered);
    if (covered === null || covered <= 0)
        return 0;
    return Math.min(covered, totalDrugs);
}
export function compareCareFitCoverage(a, b, { totalDoctors = 0, totalDrugs = 0 } = {}) {
    if (!totalDoctors && !totalDrugs)
        return 0;
    const aDoctorCount = getDoctorCareCoverageCount(a, totalDoctors);
    const bDoctorCount = getDoctorCareCoverageCount(b, totalDoctors);
    const aDrugCount = getDrugCareCoverageCount(a, totalDrugs);
    const bDrugCount = getDrugCareCoverageCount(b, totalDrugs);
    const aTotal = aDoctorCount + aDrugCount;
    const bTotal = bDoctorCount + bDrugCount;
    if (aTotal !== bTotal)
        return bTotal - aTotal;
    if (totalDoctors && aDoctorCount !== bDoctorCount)
        return bDoctorCount - aDoctorCount;
    if (totalDrugs && aDrugCount !== bDrugCount)
        return bDrugCount - aDrugCount;
    if (totalDoctors) {
        const aCrossReferenceAvailable = numberValue(a.doctors_cross_reference_available) ?? 0;
        const bCrossReferenceAvailable = numberValue(b.doctors_cross_reference_available) ?? 0;
        if (aCrossReferenceAvailable !== bCrossReferenceAvailable) {
            return bCrossReferenceAvailable - aCrossReferenceAvailable;
        }
    }
    if (totalDoctors && isProviderCoverageWeightEnabled()) {
        const aScore = numberValue(a.provider_coverage_score);
        const bScore = numberValue(b.provider_coverage_score);
        const aRank = aScore === null ? -1 : aScore;
        const bRank = bScore === null ? -1 : bScore;
        if (aRank !== bRank)
            return bRank - aRank;
    }
    return 0;
}
export function getKnownBenefitCount(plan) {
    return getPlanBenefitEvidence(plan).size;
}
export function getStarRatingValue(plan) {
    return numberValue(plan.star_rating);
}
export function getDoctorNetworkRatio(plan) {
    if (!isProviderCoverageWeightEnabled() && hasUnresolvedDoctors(plan))
        return null;
    const total = numberValue(plan.doctors_total);
    const inNetwork = numberValue(plan.doctors_in_network);
    if (total === null || inNetwork === null || total <= 0)
        return null;
    return (inNetwork
        + (numberValue(plan.doctors_likely_in_network) ?? 0)
        + (numberValue(plan.doctors_covered_via_cross_reference) ?? 0)) / total;
}
export function getProviderScore(plan) {
    return numberValue(plan.provider_score);
}
export function getReferralBurdenValue(plan) {
    return firstMappedFieldValue(plan, [
        'referrals_required',
        'referrals_needed',
        'referral_required',
        'needs_referrals',
    ], codedNumberValue);
}
export function getPriorAuthBurdenValue(plan) {
    return firstMappedFieldValue(plan, [
        'prior_authorization_required',
        'prior_auth_required',
        'prior_authorization_burden',
        'prior_auth_burden',
    ], codedNumberValue);
}
export function getSurpriseBillProtectionScore(plan) {
    return firstMappedFieldValue(plan, [
        'surprise_bill_protection',
        'billing_support_score',
        'billing_support',
        'out_of_network_protection',
    ], codedNumberValue);
}
export function getCustomerServiceScore(plan) {
    return firstMappedFieldValue(plan, [
        'customer_service_score',
        'member_experience_score',
        'satisfaction_score',
    ], codedNumberValue);
}
export function firstMappedFieldValue(plan, fields, mapValue) {
    for (const field of fields) {
        const value = mapValue(plan[field]);
        if (value !== null)
            return value;
    }
    return null;
}
export function codedNumberValue(value) {
    const numeric = numberValue(value);
    if (numeric !== null)
        return numeric;
    const token = normalizeToken(value);
    if (!token)
        return null;
    if (['yes', 'true', 'required', 'requires', 'needed', 'high', 'strong'].includes(token))
        return 1;
    if (['no', 'false', 'notrequired', 'none', 'low', 'weak'].includes(token))
        return 0;
    return null;
}
export function computeSignalStats(candidates, getValue) {
    const values = candidates.map(({ plan: candidate }) => getValue(candidate)).filter((value) => value !== null);
    return { min: Math.min(...values), max: Math.max(...values), knownCount: values.length };
}
export function lowNumberScore(plan, statsFor, getValue, weight) {
    const { min, max, knownCount } = statsFor(getValue);
    const value = getValue(plan);
    if (value === null || knownCount < 2)
        return 0;
    if (min === max)
        return 0;
    return ((max - value) / (max - min)) * weight;
}
export function highNumberScore(plan, statsFor, getValue, weight) {
    const { min, max, knownCount } = statsFor(getValue);
    const value = getValue(plan);
    if (value === null || knownCount < 2)
        return 0;
    if (min === max)
        return 0;
    return ((value - min) / (max - min)) * weight;
}
export function getRecommendationHealthProfile(parameters = {}) {
    const explicitUtilization = normalizeUtilization(parameters.health_profile?.utilization
        ?? parameters.healthProfile?.utilization
        ?? parameters.health_utilization
        ?? parameters.healthUtilization
        ?? parameters.utilization
        ?? parameters.usage);
    return { utilization: explicitUtilization || 'unknown' };
}
export function normalizeUtilization(value) {
    const token = normalizeToken(value);
    if (!token)
        return '';
    if (token.includes('veryhigh') || token.includes('hospital') || token.includes('complex'))
        return 'very_high';
    if (token.includes('high') || token.includes('heavy') || token.includes('frequent') || token.includes('multiple') || token.includes('month') || token.includes('chronic'))
        return 'high';
    if (token.includes('moderate') || token.includes('few') || token.includes('year') || token.includes('balanced'))
        return 'moderate';
    if (token.includes('low') || token.includes('rare') || token.includes('checkup') || token.includes('healthy'))
        return 'low';
    return '';
}
export function getCurrentEmployerMonthlyPremiumValue(parameters = {}) {
    return firstNumberValue([
        parameters.currentEmployerMonthlyPremium,
        parameters.current_employer_monthly_premium,
        parameters.employerMonthlyPremium,
        parameters.employer_monthly_premium,
        parameters.currentPlanMonthlyPremium,
        parameters.current_plan_monthly_premium,
    ]);
}
export function getCurrentEmployerOopMaxValue(parameters = {}) {
    return firstNumberValue([
        parameters.currentEmployerOopMax,
        parameters.current_employer_oop_max,
        parameters.employerOopMax,
        parameters.employer_oop_max,
    ]);
}
export function getCurrentEmployerDeductibleValue(parameters = {}) {
    return firstNumberValue([
        parameters.currentEmployerDeductible,
        parameters.current_employer_deductible,
        parameters.employerDeductible,
        parameters.employer_deductible,
    ]);
}
export function firstNumberValue(values) {
    for (const value of values) {
        const numeric = numberValue(value);
        if (numeric !== null && numeric >= 0)
            return numeric;
    }
    return null;
}
export function getEstimatedAnnualSavings(plan, valueContext = {}, parameters = {}) {
    const currentEmployerMonthly = getCurrentEmployerMonthlyPremiumValue(parameters);
    const currentEmployerAnnual = currentEmployerMonthly !== null
        ? roundMoney(currentEmployerMonthly * 12)
        : null;
    const planPremium = getPremiumValue(plan);
    const planPremiumAnnual = planPremium !== null ? roundMoney(planPremium * 12) : null;
    const drugCost = getDrugCostValue(plan);
    const planAnnualCost = getPlanAnnualCostValue(plan);
    const partBGivebackAnnual = roundMoney(getPartBGivebackValue(plan, valueContext) * 12);
    const netPlanAnnualCostAfterGiveback = getNetPlanAnnualCostAfterGivebackValue(plan, valueContext);
    const netAnnualExposureAfterGiveback = getNetAnnualExposureAfterGivebackValue(plan, valueContext);
    const estimatedAnnualSavings = currentEmployerAnnual !== null && planAnnualCost !== null
        ? roundMoney(currentEmployerAnnual - planAnnualCost + partBGivebackAnnual)
        : null;
    const savingsComponents = {
        current_employer_premium_annual: currentEmployerAnnual,
        plan_premium_annual: planPremiumAnnual,
        estimated_annual_drug_cost: drugCost,
        estimated_plan_annual_cost: planAnnualCost,
        part_b_giveback_annual: partBGivebackAnnual,
        net_plan_annual_cost_after_giveback: netPlanAnnualCostAfterGiveback,
        net_annual_exposure_after_giveback: netAnnualExposureAfterGiveback,
    };
    if (isEmployerCostComparisonEnabled()) {
        const employerOopMax = getCurrentEmployerOopMaxValue(parameters);
        const employerDeductible = getCurrentEmployerDeductibleValue(parameters);
        const employerAnnualExposure = (currentEmployerAnnual !== null && employerOopMax !== null)
            ? roundMoney(currentEmployerAnnual + employerOopMax)
            : null;
        savingsComponents.current_employer_oop_max = employerOopMax;
        savingsComponents.current_employer_deductible = employerDeductible;
        savingsComponents.current_employer_annual_exposure = employerAnnualExposure;
        savingsComponents.employer_vs_plan_exposure_delta =
            (employerAnnualExposure !== null && netAnnualExposureAfterGiveback !== null)
                ? roundMoney(employerAnnualExposure - netAnnualExposureAfterGiveback)
                : null;
    }
    return {
        estimatedAnnualSavings,
        savingsComponents,
        riskFactors: {
            moop: getMoopValue(plan),
            annual_deductible: getDeductibleValue(plan),
        },
    };
}
export function attachRecommendationBasis(plan, preferenceScore, savings, healthProfile) {
    return {
        ...plan,
        recommendation_basis: {
            preference_score: roundMoney(preferenceScore),
            health_profile: healthProfile,
            estimated_annual_savings: savings.estimatedAnnualSavings,
            savings_components: savings.savingsComponents,
            risk_factors: savings.riskFactors,
            basis_order: [
                'health_utilization_guardrail',
                'user_preferences',
                'drug_data_evidence',
                'estimated_annual_savings',
                'savings_tiebreakers',
                'risk_value_tiebreakers',
                'stable_plan_identity',
            ],
        },
    };
}
export function compareEstimatedAnnualSavings(a, b) {
    const aValue = a.estimatedAnnualSavings;
    const bValue = b.estimatedAnnualSavings;
    if (aValue === null || bValue === null || aValue === bValue)
        return 0;
    return bValue - aValue;
}
export function isHighUtilization(utilization) {
    return ['high', 'very_high'].includes(utilization);
}
export function compareFinancialPreference(a, b, mode, utilization = 'unknown', valueContext = {}) {
    const getNetPlanAnnualCostAfterGiveback = (plan) => getNetPlanAnnualCostAfterGivebackValue(plan, valueContext);
    const getNetAnnualExposureAfterGiveback = (plan) => getNetAnnualExposureAfterGivebackValue(plan, valueContext);
    if (mode === 'savings') {
        return compareEstimatedAnnualSavings(a, b)
            || compareLowerValue(a.plan, b.plan, getNetPlanAnnualCostAfterGiveback);
    }
    if (mode === 'oop') {
        if (isHighUtilization(utilization)) {
            return compareKnownValue(a.plan, b.plan, getMoopValue)
                || compareLowerValue(a.plan, b.plan, getMoopValue)
                || compareKnownValue(a.plan, b.plan, getNetAnnualExposureAfterGiveback)
                || compareLowerValue(a.plan, b.plan, getNetAnnualExposureAfterGiveback);
        }
        return compareKnownValue(a.plan, b.plan, getNetAnnualExposureAfterGiveback)
            || compareLowerValue(a.plan, b.plan, getNetAnnualExposureAfterGiveback)
            || compareKnownValue(a.plan, b.plan, getMoopValue)
            || compareLowerValue(a.plan, b.plan, getMoopValue);
    }
    if (mode === 'net-exposure') {
        return compareKnownValue(a.plan, b.plan, getNetAnnualExposureAfterGiveback)
            || compareLowerValue(a.plan, b.plan, getNetAnnualExposureAfterGiveback)
            || compareEstimatedAnnualSavings(a, b);
    }
    return 0;
}
export const HIGH_MOOP_GAP = 500;
export const MODERATE_MOOP_GAP = 1000;
export const VERY_HIGH_SIMILAR_MOOP_GAP = 250;
export function compareKnownMoopForHighUtilization(a, b, utilization, enabled) {
    if (!enabled || !['high', 'very_high'].includes(utilization))
        return 0;
    return compareKnownValue(a, b, getMoopValue);
}
export function compareVeryHighMoopPrimary(a, b, utilization, enabled) {
    if (!enabled || utilization !== 'very_high')
        return 0;
    const aMoop = getMoopValue(a.plan);
    const bMoop = getMoopValue(b.plan);
    if (aMoop === null || bMoop === null)
        return 0;
    if (Math.abs(aMoop - bMoop) <= VERY_HIGH_SIMILAR_MOOP_GAP)
        return 0;
    return aMoop - bMoop;
}
export function compareDrugEvidenceForDrugConcern(a, b, drugConcern) {
    if (!drugConcern)
        return 0;
    return compareKnownValue(a, b, getDrugEvidenceValue);
}
export function compareDoctorEvidenceForDoctorConcern(a, b, doctorConcern) {
    if (!doctorConcern)
        return 0;
    return compareKnownValue(a, b, getDoctorNetworkRatio);
}
export const REFERRAL_FREE_PREMIUM_CEILING_MONTHLY = 25;
export function strictBooleanValue(value) {
    return typeof value === 'boolean' ? value : null;
}
export function compareReferralPreference(a, b, referralConcern, getPremium) {
    if (!referralConcern)
        return 0;
    const aRequires = strictBooleanValue(a.requires_specialist_referral);
    const bRequires = strictBooleanValue(b.requires_specialist_referral);
    if (aRequires === null || bRequires === null || aRequires === bRequires)
        return 0;
    const [free, required] = aRequires === false ? [a, b] : [b, a];
    if (getPremium(free) - getPremium(required) > REFERRAL_FREE_PREMIUM_CEILING_MONTHLY)
        return 0;
    return aRequires === false ? -1 : 1;
}
export function compareBenefitPreferenceCoverage(a, b, benefitPreferences = [], valueContext = {}) {
    const normalizedPreferences = normalizeBenefitPreferences(benefitPreferences);
    if (!normalizedPreferences.length)
        return 0;
    const aMatches = getMatchedMaBenefitPreferences(a, normalizedPreferences).length;
    const bMatches = getMatchedMaBenefitPreferences(b, normalizedPreferences).length;
    if (aMatches === bMatches)
        return 0;
    if (!benefitCostGapWithinNormalRange(aMatches > bMatches ? a : b, aMatches > bMatches ? b : a, valueContext))
        return 0;
    return bMatches - aMatches;
}
export function benefitCostGapWithinNormalRange(benefitMatchedPlan, otherPlan, valueContext = {}) {
    const getEffectiveMonthlyPremium = (plan) => getEffectiveMonthlyPremiumValue(plan, valueContext);
    const getNetPlanAnnualCostAfterGiveback = (plan) => getNetPlanAnnualCostAfterGivebackValue(plan, valueContext);
    return valueGapWithinLimit(benefitMatchedPlan, otherPlan, getEffectiveMonthlyPremium, 75)
        && valueGapWithinLimit(benefitMatchedPlan, otherPlan, getNetPlanAnnualCostAfterGiveback, 1500)
        && valueGapWithinLimit(benefitMatchedPlan, otherPlan, getMoopValue, 2500);
}
export function valueGapWithinLimit(preferredPlan, otherPlan, getValue, limit) {
    const preferredValue = getValue(preferredPlan);
    const otherValue = getValue(otherPlan);
    if (preferredValue === null || otherValue === null)
        return true;
    return preferredValue - otherValue <= limit;
}
export function getDrugEvidenceValue(plan) {
    return getDrugCostValue(plan) !== null || getDrugCoverageRatio(plan) !== null ? 1 : null;
}
export function compareHealthUtilizationMoopGuardrail(a, b, utilization, enabled) {
    if (!enabled || !['moderate', 'high'].includes(utilization))
        return 0;
    const aMoop = getMoopValue(a.plan);
    const bMoop = getMoopValue(b.plan);
    if (aMoop === null || bMoop === null || aMoop === bMoop)
        return 0;
    const gap = Math.abs(aMoop - bMoop);
    if (utilization === 'high') {
        if (gap < HIGH_MOOP_GAP)
            return 0;
        return aMoop - bMoop;
    }
    if (gap < MODERATE_MOOP_GAP)
        return 0;
    const lower = aMoop < bMoop ? a : b;
    const higher = aMoop < bMoop ? b : a;
    const savingsDiff = getSavingsAdvantage(higher, lower);
    const lowerMoopWins = moopWinsForModerate(lower.plan, higher.plan, savingsDiff);
    return lowerMoopWins
        ? (lower === a ? -1 : 1)
        : (higher === a ? -1 : 1);
}
export function getSavingsAdvantage(higherSavingsPlan, lowerSavingsPlan) {
    if (higherSavingsPlan.estimatedAnnualSavings === null || lowerSavingsPlan.estimatedAnnualSavings === null) {
        return null;
    }
    return higherSavingsPlan.estimatedAnnualSavings - lowerSavingsPlan.estimatedAnnualSavings;
}
export function moopWinsForModerate(lowerMoopPlan, higherMoopPlan, savingsDiff) {
    const lowerMoop = getMoopValue(lowerMoopPlan);
    const higherMoop = getMoopValue(higherMoopPlan);
    if (lowerMoop === null || higherMoop === null)
        return false;
    const moopGap = higherMoop - lowerMoop;
    if (moopGap < MODERATE_MOOP_GAP)
        return false;
    const savingsAdvantage = numberValue(savingsDiff);
    if (savingsAdvantage === null)
        return true;
    return savingsAdvantage <= moopGap * 0.5;
}
export function compareSavingsTieBreakers(a, b, valueContext = {}) {
    const getPartBGiveback = (plan) => getPartBGivebackValue(plan, valueContext);
    const getEffectiveMonthlyPremium = (plan) => getEffectiveMonthlyPremiumValue(plan, valueContext);
    return compareHigherValue(a, b, getPartBGiveback)
        || compareLowerValue(a, b, getEffectiveMonthlyPremium)
        || compareLowerValue(a, b, getAnnualCostValue)
        || compareLowerValue(a, b, getDrugCostValue);
}
export function compareRiskValueTieBreakers(a, b) {
    return compareLowerValue(a, b, getMoopValue)
        || compareLowerValue(a, b, getDeductibleValue)
        || compareHigherValue(a, b, getDrugCoverageRatio)
        || compareHigherValue(a, b, getKnownBenefitCount)
        || compareHigherValue(a, b, getStarRatingValue);
}
export function compareLowerValue(a, b, getValue) {
    const aValue = getValue(a);
    const bValue = getValue(b);
    if (aValue === null || bValue === null || aValue === bValue)
        return 0;
    return aValue - bValue;
}
export function compareKnownValue(a, b, getValue) {
    const aValue = getValue(a);
    const bValue = getValue(b);
    if (aValue !== null && bValue === null)
        return -1;
    if (aValue === null && bValue !== null)
        return 1;
    return 0;
}
export function compareHigherValue(a, b, getValue) {
    const aValue = getValue(a);
    const bValue = getValue(b);
    if (aValue === null || bValue === null || aValue === bValue)
        return 0;
    return bValue - aValue;
}
export function compareStablePlanIdentity(a, b) {
    const aKey = stablePlanIdentity(a);
    const bKey = stablePlanIdentity(b);
    return aKey.localeCompare(bKey);
}
export function stablePlanIdentity(plan) {
    return [
        plan.contract_id,
        plan.plan_id,
        plan.segment_id,
        plan.plan_name || plan.name,
        plan.carrier || plan.organization_marketing_name || plan.organization_name,
    ].map((value) => textValue(value).toLowerCase()).join('|');
}
export function matchedPriorityScore(plan, priorities) {
    if (!Array.isArray(plan.matched_priorities))
        return 0;
    const requested = new Set(normalizeList(priorities));
    if (!requested.size)
        return 0;
    return plan.matched_priorities
        .map(normalizeBenefitToken)
        .filter((priority) => requested.has(priority))
        .length * 8;
}
