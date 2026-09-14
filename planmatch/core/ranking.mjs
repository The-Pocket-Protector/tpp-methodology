import { resolveBenefitIntent } from './recommendation-request-normalization.mjs';
import { compareGivebackDesc } from './ma-giveback-ranking.mjs';
import { givebackRankingMode } from './ma-giveback-ranking.mjs';
import { resolveGivebackRankingCase } from './ma-giveback-ranking.mjs';
import { poolMaxGivebackAnnual } from './ma-giveback-ranking.mjs';
import { resolveRankBasis } from './ma-giveback-ranking.mjs';
import { buildGivebackRankingAudit } from './ma-giveback-ranking.mjs';
import { militaryCoverageFromBody } from './ma-giveback-ranking.mjs';
export const PROPOSED_SCORING_MODEL_VERSION = 18;
export const MOOP_RISK_WEIGHTS = {
    very_high: 0.5, high: 0.3, moderate: 0.15, low: 0.05,
};
export const DENTAL_SPEND_DOLLARS = {
    low: 250, medium: 1000, high: 2250, very_high: 3000, not_sure: 0,
};
export const OTC_ANNUAL_DOLLARS = {
    low: 150, medium: 600, high: 900, not_sure: 0,
};
export const VISION_REPLACEMENTS_PER_YEAR = {
    yearly: 1, every_2_3_years: 1 / 2.5,
};
export const VISION_DEFAULT_CADENCE = 'every_2_3_years';
export const VISION_RARE_USE_FACTOR = 0.25;
export const VISION_EXAM_RETAIL_DOLLARS = 100;
export const HEARING_RETAIL_PAIR_DOLLARS = {
    basic: 2200, premium: 5200, mid: 4000, not_sure: 4000,
};
export const HEARING_RETAIL_PAIR_DEFAULT = 4000;
export const VISION_RETAIL_DOLLARS = {
    glassesStandard: 340, glassesProgressive: 480, contactsAnnual: 400,
};
export const DENTAL_NO_MAX_COST_SHARE_PLACEHOLDER = 0.5;
export const DENTAL_ROUTINE_ANNUAL_DRAW_DOLLARS = 400;
export const DENTAL_PROCEDURE_UCR = {
    crown: 1200, rootCanal: 1000, denture: 1400, perio: 300, extraction: 200,
};
export const DENTAL_PROCEDURE_WEIGHTS = {
    crown: 0.30, rootCanal: 0.20, denture: 0.25, perio: 0.15, extraction: 0.10,
};
export const INPATIENT_STAYS_VERY_HIGH = 1;
export const SWITCH_MATERIALITY_DOLLARS = 120;
export const VISIT_COUNT_DEFAULTS = {
    very_high: { pcp_copay: 6, specialist_copay: 12, urgent_care_copay: 2, emergency_room_copay: 1, lab_copay: 6 },
    high: { pcp_copay: 4, specialist_copay: 6, urgent_care_copay: 1, emergency_room_copay: 0, lab_copay: 4 },
    moderate: { pcp_copay: 2, specialist_copay: 2, urgent_care_copay: 1, emergency_room_copay: 0, lab_copay: 2 },
    low: { pcp_copay: 1, specialist_copay: 0, urgent_care_copay: 0, emergency_room_copay: 0, lab_copay: 1 },
};
export function normalizeLanguageTag(value) {
    if (typeof value !== 'string')
        return null;
    const primary = value.trim().toLowerCase().split(/[-_]/)[0];
    return /^[a-z]{2,3}$/.test(primary) ? primary : null;
}
export function num(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
export function recordOf(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value : null;
}
export function lineAmount(costShare, key) {
    const filed = num(costShare?.[`${key}_amount`]);
    if (filed != null)
        return { amount: filed, rangeMax: false };
    const ceiling = num(costShare?.[`${key}_amount_max`]);
    return { amount: ceiling, rangeMax: ceiling != null };
}
export function visitCostAnnual(plan, utilization) {
    const counts = VISIT_COUNT_DEFAULTS[utilization ?? 'moderate'];
    const costShare = recordOf(plan.cost_share);
    let total = 0;
    const missing = [];
    const detail = [];
    for (const key of Object.keys(counts)) {
        if (counts[key] === 0)
            continue;
        const { amount, rangeMax } = lineAmount(costShare, key);
        if (amount == null) {
            missing.push(key.replace('_copay', ''));
            continue;
        }
        total += amount * counts[key];
        detail.push({ key, count: counts[key], copay_dollars: amount, ...(rangeMax ? { range_max: true } : {}) });
    }
    if (utilization === 'very_high') {
        const inpatient = lineAmount(costShare, 'inpatient_hospital');
        if (inpatient.amount == null)
            missing.push('hospital stay');
        else {
            total += inpatient.amount * INPATIENT_STAYS_VERY_HIGH;
            detail.push({ key: 'inpatient_hospital', count: INPATIENT_STAYS_VERY_HIGH, copay_dollars: inpatient.amount, ...(inpatient.rangeMax ? { range_max: true } : {}) });
        }
    }
    return { total, missing, detail };
}
export function visionFactsToParsed(vision) {
    if (!vision)
        return null;
    const perPeriod = num(vision.eyewear_per_period_allowance);
    const periodMonths = num(vision.eyewear_period_months);
    if (perPeriod != null && periodMonths != null && periodMonths > 0) {
        return { amount: perPeriod, periodsPerYear: 12 / periodMonths };
    }
    const capacity = num(vision.eyewear_annual_capacity);
    if (capacity != null)
        return { amount: capacity, periodsPerYear: 1 };
    return null;
}
export const SHARED_ALLOWANCE_TOKENS = ['dental', 'vision', 'hearing'];
export function visionCharge(choices, facts) {
    const eyewear = String(choices.eyewear ?? '');
    if (eyewear === '') {
        return { token: 'vision', amount: 0, need: 0, coverage_applied: 0, basis: 'no_stated_need' };
    }
    if (eyewear === 'none') {
        const examCopay = num(facts?.exam_copay);
        if (facts?.exam_covered === true && examCopay != null) {
            const amount = Math.min(Math.max(0, Math.round(examCopay)), VISION_EXAM_RETAIL_DOLLARS);
            return { token: 'vision', amount, need: VISION_EXAM_RETAIL_DOLLARS, coverage_applied: VISION_EXAM_RETAIL_DOLLARS - amount, basis: 'exam_price' };
        }
        return {
            token: 'vision', amount: VISION_EXAM_RETAIL_DOLLARS, need: VISION_EXAM_RETAIL_DOLLARS, coverage_applied: 0,
            basis: facts ? (facts.exam_covered === false ? 'full_bill_not_covered' : 'fail_closed_unknown_coverage') : 'facts_missing',
        };
    }
    const lensType = String(choices.lens_type ?? choices.lensType ?? '');
    const retailPerReplacement = eyewear === 'contacts'
        ? VISION_RETAIL_DOLLARS.contactsAnnual
        : eyewear === 'both'
            ? Math.max(lensType === 'progressive' ? VISION_RETAIL_DOLLARS.glassesProgressive : VISION_RETAIL_DOLLARS.glassesStandard, VISION_RETAIL_DOLLARS.contactsAnnual)
            : lensType === 'progressive' ? VISION_RETAIL_DOLLARS.glassesProgressive : VISION_RETAIL_DOLLARS.glassesStandard;
    const cadenceId = String(choices.replacement_cadence ?? choices.replacementCadence ?? VISION_DEFAULT_CADENCE);
    const isRare = cadenceId === 'rarely';
    const replacementsPerYear = VISION_REPLACEMENTS_PER_YEAR[isRare ? 'yearly' : cadenceId]
        ?? VISION_REPLACEMENTS_PER_YEAR[VISION_DEFAULT_CADENCE];
    const rareFactor = isRare ? VISION_RARE_USE_FACTOR : 1;
    const need = Math.round(retailPerReplacement * replacementsPerYear * rareFactor);
    const parsed = visionFactsToParsed(facts);
    if (parsed == null) {
        return {
            token: 'vision', amount: need, need, coverage_applied: 0,
            basis: facts ? 'fail_closed_unknown_coverage' : 'facts_missing',
        };
    }
    const claimsPerYear = Math.min(parsed.periodsPerYear, replacementsPerYear);
    let coverage = Math.round(parsed.amount * claimsPerYear * rareFactor);
    if (eyewear === 'contacts' && facts?.contacts_covered === false)
        coverage = 0;
    const amount = Math.max(0, need - coverage);
    return {
        token: 'vision', amount, need, coverage_applied: Math.min(coverage, need),
        basis: amount === 0 ? 'fully_covered' : 'partial',
    };
}
export function hearingCharge(facts, choices) {
    const timing = String(choices.replacement_timing ?? choices.replacementTiming ?? '');
    const usage = String(choices.usage ?? choices.currentStatus ?? '');
    const buying = timing === 'soon' || usage === 'prospective';
    if (!buying) {
        return { token: 'hearing', amount: 0, need: 0, coverage_applied: 0, basis: 'no_buying_signal' };
    }
    const deviceTier = String(choices.device_tier ?? choices.deviceTier ?? '');
    const retailPair = HEARING_RETAIL_PAIR_DOLLARS[deviceTier] ?? HEARING_RETAIL_PAIR_DEFAULT;
    const fullBill = (basis) => ({ token: 'hearing', amount: retailPair, need: retailPair, coverage_applied: 0, basis });
    if (!facts)
        return fullBill('facts_missing');
    if (facts.aid_covered === false)
        return fullBill('full_bill_not_covered');
    const model = facts.benefit_model;
    if (model == null || model === 'unspecified')
        return fullBill('fail_closed_unknown_coverage');
    const tierMin = num(facts.tier_copay_min);
    const tierMax = num(facts.tier_copay_max);
    const perAidCopay = deviceTier === 'basic' ? (tierMin ?? tierMax)
        : deviceTier === 'premium' ? (tierMax ?? tierMin)
            : tierMin != null && tierMax != null ? Math.round((tierMin + tierMax) / 2) : (tierMin ?? tierMax);
    const capacity = num(facts.annualized_pair_capacity);
    let amount;
    if (model === 'allowance') {
        if (capacity == null)
            return fullBill('fail_closed_unknown_coverage');
        amount = Math.min(retailPair, Math.max(0, Math.round(retailPair - capacity)));
    }
    else if (model === 'allowance+copay_tier') {
        if (capacity == null || perAidCopay == null)
            return fullBill('fail_closed_unknown_coverage');
        amount = Math.min(retailPair, Math.max(0, Math.round(retailPair - capacity)) + 2 * perAidCopay);
    }
    else {
        if (perAidCopay == null)
            return fullBill('fail_closed_unknown_coverage');
        amount = Math.min(2 * perAidCopay, retailPair);
    }
    return {
        token: 'hearing', amount, need: retailPair, coverage_applied: retailPair - amount,
        basis: amount === 0 ? 'fully_covered' : 'copay_price',
    };
}
export function dentalEffectiveShareRate(plan) {
    const estimates = recordOf(recordOf(plan.benefit_procedure_estimates)?.dental);
    if (!estimates)
        return null;
    let weightTotal = 0;
    let weighted = 0;
    for (const [procedure, ucr] of Object.entries(DENTAL_PROCEDURE_UCR)) {
        const oop = num(estimates[procedure]);
        if (oop == null)
            continue;
        const weight = DENTAL_PROCEDURE_WEIGHTS[procedure] ?? 0;
        if (weight <= 0)
            continue;
        weighted += Math.min(Math.max(oop / ucr, 0), 1) * weight;
        weightTotal += weight;
    }
    return weighted + (1 - weightTotal);
}
export const DENTAL_PRICEABLE_MODELS = new Set(['copay', 'coinsurance', 'zero_copay', 'mixed']);
export function dentalCharge(plan, choices) {
    const need = DENTAL_SPEND_DOLLARS[String(choices.annual_spend ?? choices.annualSpend ?? 'not_sure')] ?? 0;
    if (need === 0) {
        return { token: 'dental', amount: 0, need: 0, coverage_applied: 0, basis: 'no_stated_need' };
    }
    const tier = recordOf(plan.benefit_preference_tiers)?.dental;
    const maxBlock = recordOf(recordOf(plan.benefit_max_amounts)?.dental);
    if (typeof tier !== 'string') {
        return { token: 'dental', amount: need, need, coverage_applied: 0, basis: 'fail_closed_unknown_coverage' };
    }
    const dentalFacts = recordOf(recordOf(plan.dvh_benefit_facts)?.dental);
    const capRows = dentalFacts?.caps;
    const hasStructuredCaps = Array.isArray(capRows);
    const usage = String(choices.usage ?? 'unknown');
    if (hasStructuredCaps) {
        const needScope = usage === 'preventive' ? 'preventive' : 'comprehensive';
        const eligible = capRows
            .map(recordOf)
            .filter((cap) => cap !== null)
            .filter(cap => cap.funding === 'dedicated')
            .filter(cap => cap.scope === needScope || cap.scope === 'preventive_and_comprehensive')
            .map(cap => ({ cap, annual: num(cap.annual_capacity) }))
            .filter((entry) => entry.annual != null);
        if (eligible.length > 0) {
            const selected = eligible.sort((a, b) => b.annual - a.annual)[0];
            const combined = selected.cap.scope === 'preventive_and_comprehensive';
            const statedNeedIncludesRoutine = usage === 'both';
            const drawnDown = needScope === 'comprehensive' && combined && !statedNeedIncludesRoutine;
            const usable = drawnDown
                ? Math.max(0, selected.annual - DENTAL_ROUTINE_ANNUAL_DRAW_DOLLARS)
                : selected.annual;
            const amount = Math.max(0, Math.round(need - usable));
            return {
                token: 'dental', amount, need, coverage_applied: Math.min(usable, need),
                basis: amount === 0 ? 'fully_covered' : drawnDown ? 'max_math_drawdown' : 'max_math',
            };
        }
    }
    if (tier === 'none' || tier === 'preventive_only') {
        return { token: 'dental', amount: need, need, coverage_applied: 0, basis: 'full_bill_not_covered' };
    }
    const maxAnnual = hasStructuredCaps ? null : num(maxBlock?.annual);
    if (maxAnnual != null) {
        const scope = dentalFacts?.max_scope;
        const statedNeedIncludesRoutine = String(choices.usage ?? '') === 'both';
        const drawnDown = scope !== 'comprehensive_only' && !statedNeedIncludesRoutine;
        const usable = drawnDown ? Math.max(0, maxAnnual - DENTAL_ROUTINE_ANNUAL_DRAW_DOLLARS) : maxAnnual;
        const amount = Math.max(0, Math.round(need - usable));
        return {
            token: 'dental', amount, need, coverage_applied: Math.min(usable, need),
            basis: amount === 0 ? 'fully_covered' : drawnDown ? 'max_math_drawdown' : 'max_math',
        };
    }
    const model = recordOf(plan.benefit_cost_sharing_models)?.dental;
    if (typeof model === 'string' && DENTAL_PRICEABLE_MODELS.has(model)) {
        const rate = dentalEffectiveShareRate(plan);
        if (rate != null) {
            const amount = Math.round(need * rate);
            return {
                token: 'dental', amount, need, coverage_applied: need - amount,
                basis: amount === 0 ? 'fully_covered' : 'structure_math',
            };
        }
    }
    const amount = Math.round(need * DENTAL_NO_MAX_COST_SHARE_PLACEHOLDER);
    return { token: 'dental', amount, need, coverage_applied: need - amount, basis: 'cost_share_placeholder' };
}
export function otcCharge(facts, choices) {
    const need = OTC_ANNUAL_DOLLARS[String(choices.monthly_spend ?? choices.monthlySpend ?? 'not_sure')] ?? 0;
    if (need === 0) {
        return { token: 'otc', amount: 0, need: 0, coverage_applied: 0, basis: 'no_stated_need' };
    }
    if (!facts) {
        return { token: 'otc', amount: need, need, coverage_applied: 0, basis: 'facts_missing' };
    }
    if (facts.covered !== true) {
        return { token: 'otc', amount: need, need, coverage_applied: 0, basis: 'full_bill_not_covered' };
    }
    const capacity = num(facts.annual_capacity);
    if (capacity == null) {
        return { token: 'otc', amount: need, need, coverage_applied: 0, basis: 'fail_closed_unknown_coverage' };
    }
    const amount = Math.max(0, Math.round(need - capacity));
    return {
        token: 'otc', amount, need, coverage_applied: Math.min(capacity, need),
        basis: amount === 0 ? 'fully_covered' : 'partial',
    };
}
export function benefitCharges(plan, inputs) {
    const facts = recordOf(plan.dvh_benefit_facts);
    const perToken = [];
    let total = 0;
    const DVH_TOKENS = new Set(['dental', 'vision', 'hearing', 'otc']);
    for (const token of inputs.selectedBenefits) {
        const choices = inputs.benefitChoices[token] ?? {};
        const coverageIntent = DVH_TOKENS.has(token) && resolveBenefitIntent(token, choices) === 'coverage';
        const row = coverageIntent
            ? { token, amount: 0, need: 0, coverage_applied: 0, basis: 'coverage_intent_not_priced' }
            : token === 'hearing' ? hearingCharge(recordOf(facts?.hearing), choices)
                : token === 'vision' ? visionCharge(choices, recordOf(facts?.vision))
                    : token === 'dental' ? dentalCharge(plan, choices)
                        : token === 'otc' ? otcCharge(recordOf(facts?.otc), choices)
                            : { token, amount: 0, need: 0, coverage_applied: 0, basis: 'no_stated_need' };
        total += row.amount;
        perToken.push(row);
    }
    const summary = recordOf(plan.dvh_benefits);
    const allowance = recordOf(summary?.combined_allowance);
    const rawCapacity = num(allowance?.annual_dollars);
    const annualCapacity = rawCapacity != null ? Math.max(0, Math.round(rawCapacity)) : 0;
    const appliesTo = new Set(Array.isArray(allowance?.applies_to)
        ? allowance.applies_to.filter((token) => typeof token === 'string')
        : []);
    const dental = recordOf(summary?.dental);
    const vision = recordOf(recordOf(summary?.vision)?.eyewear);
    const hearing = recordOf(recordOf(summary?.hearing)?.aid);
    const marked = {
        dental: dental?.max_benefit_is_shared === true,
        vision: vision?.allowance_is_shared === true,
        hearing: hearing?.allowance_is_shared === true,
    };
    const chargeByToken = new Map();
    for (const row of perToken) {
        chargeByToken.set(row.token, (chargeByToken.get(row.token) ?? 0) + row.amount);
    }
    const eligibleTokens = SHARED_ALLOWANCE_TOKENS.filter(token => marked[token] && appliesTo.has(token) && (chargeByToken.get(token) ?? 0) > 0);
    const eligibleCharges = eligibleTokens.reduce((sum, token) => sum + (chargeByToken.get(token) ?? 0), 0);
    const offsetAmount = Math.min(annualCapacity, eligibleCharges);
    const sharedAllowanceOffset = offsetAmount > 0
        ? { amount: offsetAmount, annual_capacity: annualCapacity, eligible_tokens: [...eligibleTokens] }
        : null;
    return {
        total: total - offsetAmount,
        perToken,
        sharedAllowanceOffset,
    };
}
export function confirmedDoctorCount(plan) {
    const verifiedIn = num(plan.doctors_in_network);
    const doctorsTotal = num(plan.doctors_total);
    return doctorsTotal != null && doctorsTotal > 0 && verifiedIn != null && verifiedIn > 0
        ? Math.min(verifiedIn, doctorsTotal)
        : 0;
}
export function coverageCounts(plan) {
    const verifiedIn = num(plan.doctors_in_network);
    const likelyIn = num(plan.doctors_likely_in_network);
    const crossReferenceIn = num(plan.doctors_covered_via_cross_reference);
    const doctorsInNetwork = verifiedIn != null
        ? verifiedIn + (likelyIn ?? 0) + (crossReferenceIn ?? 0)
        : likelyIn != null ? likelyIn + (crossReferenceIn ?? 0) : crossReferenceIn;
    const doctorsTotal = num(plan.doctors_total);
    const drugsCovered = num(plan.drugs_covered);
    const drugsTotal = num(plan.drugs_total);
    return {
        doctors: doctorsTotal != null && doctorsTotal > 0 && doctorsInNetwork != null && doctorsInNetwork > 0
            ? Math.min(doctorsInNetwork, doctorsTotal) : 0,
        drugs: drugsTotal != null && drugsTotal > 0 && drugsCovered != null && drugsCovered > 0
            ? Math.min(drugsCovered, drugsTotal) : 0,
    };
}
export const CONFIRMED_OUT_OF_NETWORK_STATUSES = new Set(['out_of_network', 'not_in_network']);
export function confirmedDroppedDoctors(plan) {
    const rows = Array.isArray(plan.provider_details) ? plan.provider_details : [];
    return rows.filter((row) => {
        const status = recordOf(row)?.status;
        const crossReference = recordOf(recordOf(row)?.cross_reference);
        return crossReference?.status !== 'acknowledged'
            && typeof status === 'string'
            && CONFIRMED_OUT_OF_NETWORK_STATUSES.has(status.toLowerCase());
    }).length;
}
export function confirmedDroppedDrugs(plan, drugEvidenceReliable) {
    if (!drugEvidenceReliable)
        return 0;
    const details = Array.isArray(plan.drug_details) ? plan.drug_details : null;
    if (details)
        return details.filter((row) => {
            const detail = recordOf(row);
            const exclusion = detail?.prescription_comparison_exclusion;
            return detail?.covered === false && exclusion !== 'otc' && exclusion !== 'dietary_supplement';
        }).length;
    const uncovered = Array.isArray(plan.uncovered_drugs) ? plan.uncovered_drugs : null;
    return uncovered ? uncovered.length : 0;
}
export function scorePlanProposed(plan, savings, inputs) {
    const warnings = [];
    const netAnnual = num(savings?.net_plan_annual_cost_after_giveback);
    if (netAnnual == null)
        warnings.push('no engine cost rollup — plan cannot be cost-scored');
    const visits = visitCostAnnual(plan, inputs.utilization);
    if (visits.missing.length > 0) {
        warnings.push(`No copay data for: ${visits.missing.join(', ')} — plan cannot be cost-scored`);
    }
    const moop = num(plan.moop);
    const riskWeight = MOOP_RISK_WEIGHTS[inputs.utilization ?? 'moderate'] ?? 0.15;
    const dsnpZeroDollar = recordOf(plan.cost_share)?.dsnp_zero_dollar === true;
    const risk = dsnpZeroDollar ? 0 : (moop != null ? Math.round(moop * riskWeight) : null);
    if (risk == null)
        warnings.push('MOOP unknown — plan cannot be cost-scored');
    const benefits = benefitCharges(plan, inputs);
    const offRetail = num(plan.estimated_annual_off_formulary_retail);
    const drugUnpriced = num(plan.off_formulary_unpriced_count) ?? 0;
    const drugSubstituted = num(plan.off_formulary_substituted_count) ?? 0;
    const uncoveredNames = Array.isArray(plan.uncovered_drugs) ? plan.uncovered_drugs.length : 0;
    const drugsTotal = num(plan.drugs_total) ?? 0;
    const drugsCovered = num(plan.drugs_covered);
    const hasUncovered = uncoveredNames > 0
        || (drugsTotal > 0 && drugsCovered != null && drugsCovered < drugsTotal);
    if (drugUnpriced > 0) {
        warnings.push(`${drugUnpriced} off-formulary drug(s) unpriced — plan cannot be cost-scored`);
    }
    const retailTerm = hasUncovered ? offRetail : (offRetail ?? 0);
    if (hasUncovered && retailTerm == null) {
        warnings.push('uncovered drugs carry no cash-retail estimate — plan cannot be cost-scored');
    }
    const coveredUnpriceable = plan.annual_cost_estimable === false;
    if (coveredUnpriceable) {
        warnings.push('covered drug cost not estimable — plan cannot be cost-scored');
    }
    return {
        adjusted_annual_cost: netAnnual != null && visits.missing.length === 0 && risk != null
            && drugUnpriced === 0 && retailTerm != null && !coveredUnpriceable
            ? Math.round(netAnnual + visits.total + risk + benefits.total + retailTerm) : null,
        components: {
            net_annual: netAnnual,
            giveback_annual: num(savings?.part_b_giveback_annual) ?? 0,
            visits_total: visits.total,
            visits_detail: visits.detail,
            risk_term: risk,
            moop,
            benefits: benefits.perToken,
            ...(benefits.sharedAllowanceOffset
                ? { shared_allowance_offset: benefits.sharedAllowanceOffset }
                : {}),
            off_formulary_retail_annual: retailTerm,
            ...(drugUnpriced > 0 ? { drug_unpriced_count: drugUnpriced } : {}),
            ...(drugSubstituted > 0 ? { drug_substituted_count: drugSubstituted } : {}),
        },
        coverage: coverageCounts(plan),
        missing_copay_data: visits.missing,
        warnings,
    };
}
export function runProposedRanking({ recommendations, currentPlan, currentPlanSavings, inputs, drugEvidenceReliable = true, givebackPlacement = null, }) {
    const blocks = recommendations.map(({ plan, savings }) => scorePlanProposed(plan, savings, inputs));
    const currentBlock = currentPlan ? scorePlanProposed(currentPlan, currentPlanSavings, inputs) : null;
    const starTie = (ai, bi) => {
        const a = num(recommendations[ai].plan.star_rating);
        const b = num(recommendations[bi].plan.star_rating);
        return a != null && b != null ? b - a : 0;
    };
    const sessionLanguage = normalizeLanguageTag(inputs.sessionLanguage) ?? 'en';
    const planLanguages = (plan) => {
        const block = recordOf(plan.language_targeting);
        const langs = Array.isArray(block?.languages) ? block.languages : [];
        return langs.map((l) => normalizeLanguageTag(l)).filter((l) => l != null);
    };
    const langFit = (plan) => {
        const langs = planLanguages(plan);
        if (langs.length === 0)
            return 'neutral';
        return langs.includes(sessionLanguage) ? 'match' : 'mismatch';
    };
    const langTie = (ai, bi) => {
        const a = langFit(recommendations[ai].plan) === 'match' ? 1 : 0;
        const b = langFit(recommendations[bi].plan) === 'match' ? 1 : 0;
        return b - a;
    };
    const confirmedTie = (ai, bi) => confirmedDoctorCount(recommendations[bi].plan) - confirmedDoctorCount(recommendations[ai].plan);
    const givebackTie = givebackPlacement ? compareGivebackDesc(blocks) : null;
    const rankOrder = blocks.map((_, index) => index).sort((ai, bi) => {
        const a = blocks[ai];
        const b = blocks[bi];
        if (givebackTie && givebackPlacement === 'first') {
            const giveback = givebackTie(ai, bi);
            if (giveback !== 0)
                return giveback;
        }
        const confirmed = confirmedTie(ai, bi);
        if (confirmed !== 0)
            return confirmed;
        const aSum = a.coverage.doctors + a.coverage.drugs;
        const bSum = b.coverage.doctors + b.coverage.drugs;
        if (aSum !== bSum)
            return bSum - aSum;
        if (a.coverage.doctors !== b.coverage.doctors)
            return b.coverage.doctors - a.coverage.doctors;
        if (a.coverage.drugs !== b.coverage.drugs)
            return b.coverage.drugs - a.coverage.drugs;
        const aCrossReferenceAvailable = num(recommendations[ai].plan.doctors_cross_reference_available) ?? 0;
        const bCrossReferenceAvailable = num(recommendations[bi].plan.doctors_cross_reference_available) ?? 0;
        if (aCrossReferenceAvailable !== bCrossReferenceAvailable) {
            return bCrossReferenceAvailable - aCrossReferenceAvailable;
        }
        if (givebackTie && givebackPlacement === 'after_coverage') {
            const giveback = givebackTie(ai, bi);
            if (giveback !== 0)
                return giveback;
        }
        if (a.adjusted_annual_cost == null && b.adjusted_annual_cost == null)
            return langTie(ai, bi) || starTie(ai, bi) || ai - bi;
        if (a.adjusted_annual_cost == null)
            return 1;
        if (b.adjusted_annual_cost == null)
            return -1;
        return a.adjusted_annual_cost - b.adjusted_annual_cost || langTie(ai, bi) || starTie(ai, bi) || ai - bi;
    });
    const pickEligible = (plan) => {
        const star = num(plan.star_rating);
        return !(star != null && star < 3) && plan.is_low_performing !== true;
    };
    const eligibleFlags = recommendations.map(({ plan }) => pickEligible(plan));
    const ineligibleCount = eligibleFlags.filter((eligible) => !eligible).length;
    const floorRelaxed = recommendations.length > 0 && ineligibleCount === recommendations.length;
    const floorPickable = (index) => floorRelaxed || eligibleFlags[index];
    const langEligibleFlags = recommendations.map(({ plan }) => langFit(plan) !== 'mismatch');
    const langDemotedCount = recommendations.reduce((count, _, index) => count + (floorPickable(index) && !langEligibleFlags[index] ? 1 : 0), 0);
    const langRelaxed = recommendations.length > 0
        && !recommendations.some((_, index) => floorPickable(index) && langEligibleFlags[index]);
    const langPickable = (index) => floorPickable(index) && (langRelaxed || langEligibleFlags[index]);
    const visionCoverageIntent = inputs.selectedBenefits.includes('vision')
        && resolveBenefitIntent('vision', inputs.benefitChoices.vision ?? {}) === 'coverage';
    const examCoveredOf = (plan) => recordOf(recordOf(plan.dvh_benefit_facts)?.vision)?.exam_covered;
    const preventiveEligibleFlags = recommendations.map(({ plan }) => !visionCoverageIntent || examCoveredOf(plan) !== false);
    const preventiveUnknownCount = visionCoverageIntent
        ? recommendations.filter(({ plan }) => examCoveredOf(plan) == null).length
        : 0;
    const preventiveDemotedCount = recommendations.reduce((count, _, index) => count + (langPickable(index) && !preventiveEligibleFlags[index] ? 1 : 0), 0);
    const preventiveRelaxed = visionCoverageIntent && recommendations.length > 0
        && !recommendations.some((_, index) => langPickable(index) && preventiveEligibleFlags[index]);
    const pickable = (index) => langPickable(index) && (preventiveRelaxed || preventiveEligibleFlags[index]);
    let winnerIndex = rankOrder.find((index) => pickable(index) && blocks[index].adjusted_annual_cost != null) ?? null;
    const allPlans = currentPlan ? [currentPlan, ...recommendations.map((r) => r.plan)] : recommendations.map((r) => r.plan);
    const enteredDoctors = Math.max(0, ...allPlans.map((p) => num(p.doctors_total) ?? 0));
    const enteredDrugs = Math.max(0, ...allPlans.map((p) => num(p.drugs_total) ?? 0));
    const anythingEntered = enteredDoctors + enteredDrugs > 0;
    const coversAllEntered = (block) => anythingEntered && block.coverage.doctors === enteredDoctors && block.coverage.drugs === enteredDrugs;
    const coverageSum = (block) => block.coverage.doctors + block.coverage.drugs;
    const combinedDoctorsIn = (p) => {
        const verified = num(p.doctors_in_network);
        const likely = num(p.doctors_likely_in_network);
        const crossReference = num(p.doctors_covered_via_cross_reference);
        return verified != null
            ? verified + (likely ?? 0) + (crossReference ?? 0)
            : likely != null ? likely + (crossReference ?? 0) : crossReference;
    };
    const coverageKnown = (p) => (enteredDoctors === 0 || combinedDoctorsIn(p) != null)
        && (enteredDrugs === 0 || num(p.drugs_covered) != null);
    const coverageEvidence = currentPlan && currentBlock
        ? {
            current_confirmed_dropped_doctors: anythingEntered ? confirmedDroppedDoctors(currentPlan) : 0,
            current_confirmed_dropped_drugs: anythingEntered ? confirmedDroppedDrugs(currentPlan, drugEvidenceReliable) : 0,
        }
        : null;
    const confirmedGaps = coverageEvidence
        ? coverageEvidence.current_confirmed_dropped_doctors + coverageEvidence.current_confirmed_dropped_drugs
        : 0;
    let verdict;
    let trigger = null;
    let marginVsCurrent = null;
    const costMargin = (index) => currentBlock?.adjusted_annual_cost != null && blocks[index]?.adjusted_annual_cost != null
        ? currentBlock.adjusted_annual_cost - blocks[index].adjusted_annual_cost
        : null;
    const namedIndex = winnerIndex ?? rankOrder.find(pickable) ?? (rankOrder.length > 0 ? rankOrder[0] : null);
    if (!currentBlock) {
        verdict = winnerIndex !== null ? 'no-current-plan' : 'insufficient-data';
    }
    else if (confirmedGaps > 0 && namedIndex !== null
        && coverageSum(blocks[namedIndex]) > coverageSum(currentBlock)) {
        verdict = 'switch';
        trigger = 'coverage';
        winnerIndex = namedIndex;
        marginVsCurrent = costMargin(namedIndex);
    }
    else if (confirmedGaps === 0 && coversAllEntered(currentBlock)
        && recommendations.length > 0
        && recommendations.every(({ plan }) => coverageKnown(plan))
        && !blocks.some(coversAllEntered)) {
        verdict = 'stay';
        trigger = 'coverage';
        marginVsCurrent = winnerIndex !== null ? costMargin(winnerIndex) : null;
    }
    else if (winnerIndex === null || currentBlock.adjusted_annual_cost == null) {
        verdict = 'insufficient-data';
    }
    else {
        marginVsCurrent = currentBlock.adjusted_annual_cost - blocks[winnerIndex].adjusted_annual_cost;
        verdict = marginVsCurrent >= SWITCH_MATERIALITY_DOLLARS ? 'switch' : 'stay';
        trigger = 'cost';
    }
    const qualityFloor = {
        applied: !floorRelaxed && ineligibleCount > 0,
        relaxed: floorRelaxed,
        ineligible_count: ineligibleCount,
        winner_unrated: winnerIndex != null && num(recommendations[winnerIndex].plan.star_rating) == null,
    };
    const languageTargeting = {
        applied: !langRelaxed && langDemotedCount > 0,
        relaxed: langRelaxed,
        demoted_count: langDemotedCount,
        session_language: sessionLanguage,
    };
    const preventiveInclusion = {
        applied: !preventiveRelaxed && preventiveDemotedCount > 0,
        relaxed: preventiveRelaxed,
        demoted_count: preventiveDemotedCount,
        unknown_count: preventiveUnknownCount,
        benefits: visionCoverageIntent ? ['vision'] : [],
    };
    return { blocks, currentBlock, rankOrder, verdict, trigger, coverageEvidence, margin_vs_current: marginVsCurrent, winnerIndex, qualityFloor, languageTargeting, preventiveInclusion };
}
export const PROPOSED_RANK_BASIS = 'proposed';
export function proposedRankingMode(env = process.env) {
    const value = String(env.MA_PROPOSED_RANKING || '').toLowerCase();
    return value === 'rank' ? 'rank' : value === 'shadow' ? 'shadow' : 'off';
}
export function visionChoicesFromProfile(profile) {
    if (!profile)
        return {};
    const choices = {};
    if (profile.intent != null)
        choices.intent = profile.intent;
    if (profile.wears != null)
        choices.eyewear = profile.wears;
    if (profile.replacement_cadence != null)
        choices.replacement_cadence = profile.replacement_cadence;
    if (profile.lens_type != null)
        choices.lens_type = profile.lens_type;
    return choices;
}
export function proposedRankingInputsFromBody(body, normalizeUtilization) {
    const tier = normalizeUtilization(body.health_profile?.utilization
        ?? body.healthProfile?.utilization
        ?? body.health_utilization
        ?? body.healthUtilization
        ?? body.utilization
        ?? body.usage);
    return {
        utilization: tier === 'low' || tier === 'moderate' || tier === 'high' || tier === 'very_high' ? tier : null,
        sessionLanguage: normalizeLanguageTag(body.locale),
        militaryCoverage: militaryCoverageFromBody(body),
    };
}
export function attachProposedScoring({ payload, utilization, sessionLanguage = null, selectedBenefits, benefitChoices, visionProfile, mode = proposedRankingMode(), requestedOfferRx = null, militaryCoverage = [], givebackMode = givebackRankingMode(), metrics, }) {
    if (mode === 'off')
        return;
    try {
        const rows = payload.recommendations ?? [];
        const inputs = {
            utilization,
            sessionLanguage,
            selectedBenefits,
            benefitChoices: { ...benefitChoices, vision: visionChoicesFromProfile(visionProfile) },
        };
        const currentAnalysis = recordOf(payload.current_plan_analysis);
        const currentPlan = recordOf(currentAnalysis?.plan);
        const coverageWarnings = [];
        const payloadRecord = payload;
        const doctorsRequired = typeof payloadRecord.care_match_doctors_required === 'number' && payloadRecord.care_match_doctors_required > 0;
        const drugsRequired = typeof payloadRecord.care_match_drugs_required === 'number' && payloadRecord.care_match_drugs_required > 0;
        if (rows.length > 0 && doctorsRequired && rows.every((row) => row.doctors_in_network == null)) {
            coverageWarnings.push('doctor_coverage_unresolved');
        }
        if (rows.length > 0 && drugsRequired && rows.every((row) => row.drugs_covered == null)) {
            coverageWarnings.push('drug_coverage_unresolved');
        }
        const drugLookupFailed = Array.isArray(payloadRecord.warnings)
            && payloadRecord.warnings.some((w) => recordOf(w)?.code === 'drug_lookup_failed');
        const drugEvidenceReliable = !drugLookupFailed && !coverageWarnings.includes('drug_coverage_unresolved');
        const givebackCase = givebackMode === 'off' ? null
            : resolveGivebackRankingCase({ requestedOfferRx, militaryCoverage });
        const givebackPlacement = givebackCase && givebackMode === 'rank' ? givebackCase.placement : null;
        const rankingArgs = {
            recommendations: rows.map((row) => ({
                plan: row,
                savings: recordOf(recordOf(row.recommendation_basis)?.savings_components),
            })),
            currentPlan,
            currentPlanSavings: recordOf(currentAnalysis?.savings_components),
            inputs,
            drugEvidenceReliable,
        };
        const result = runProposedRanking({ ...rankingArgs, givebackPlacement });
        const poolMaxGiveback = givebackCase ? poolMaxGivebackAnnual(result.blocks) : 0;
        const rankBasis = givebackCase ? resolveRankBasis(givebackPlacement, poolMaxGiveback) : PROPOSED_RANK_BASIS;
        let givebackAudit = null;
        if (givebackCase && givebackMode !== 'off') {
            let shadow = null;
            if (givebackMode === 'shadow') {
                const would = runProposedRanking({ ...rankingArgs, givebackPlacement: givebackCase.placement });
                const wouldWinner = would.winnerIndex === null ? null : rows[would.winnerIndex];
                shadow = {
                    rank1_changes: would.rankOrder[0] !== result.rankOrder[0],
                    winner_changes: would.winnerIndex !== result.winnerIndex,
                    would_be_winner: wouldWinner
                        ? { contract_id: wouldWinner.contract_id ?? null, plan_id: wouldWinner.plan_id ?? null }
                        : null,
                };
            }
            givebackAudit = buildGivebackRankingAudit({ mode: givebackMode, resolution: givebackCase, basis: rankBasis, poolMaxGiveback, shadow });
        }
        rows.forEach((row, index) => { row.proposed_scoring = result.blocks[index]; });
        if (currentAnalysis && result.currentBlock)
            currentAnalysis.proposed_scoring = result.currentBlock;
        rows.forEach((row, index) => { row.priceable = result.blocks[index].adjusted_annual_cost != null; });
        if (currentAnalysis && result.currentBlock)
            currentAnalysis.priceable = result.currentBlock.adjusted_annual_cost != null;
        const currentRowIndex = rows.findIndex((row) => row.is_current_plan === true);
        const currentOrderPosition = currentRowIndex === -1 ? -1 : result.rankOrder.indexOf(currentRowIndex);
        const currentProposedRank = currentOrderPosition === -1 ? null : currentOrderPosition + 1;
        result.rankOrder.forEach((rowIndex, position) => {
            rows[rowIndex].proposed_rank = position + 1;
            rows[rowIndex].proposed_rank_basis = rankBasis;
        });
        if (currentAnalysis) {
            currentAnalysis.proposed_rank = currentProposedRank;
            currentAnalysis.proposed_rank_basis = currentProposedRank === null ? null : rankBasis;
        }
        payload.proposed_ranking = {
            mode,
            rank_basis: rankBasis,
            ...(givebackAudit ? { giveback_ranking: givebackAudit } : {}),
            coverage_warnings: coverageWarnings,
            verdict: result.verdict,
            verdict_trigger: result.trigger,
            verdict_coverage_evidence: result.coverageEvidence,
            quality_floor: result.qualityFloor,
            language_targeting: result.languageTargeting,
            preventive_inclusion: result.preventiveInclusion,
            current_plan_proposed_rank: currentProposedRank,
            current_plan_rank_out_of: currentProposedRank === null ? null : rows.length,
            current_plan_rank_basis: currentProposedRank === null ? null : rankBasis,
            margin_vs_current: result.margin_vs_current,
            switch_materiality_dollars: SWITCH_MATERIALITY_DOLLARS,
            winner: result.winnerIndex !== null
                ? { contract_id: rows[result.winnerIndex]?.contract_id ?? null, plan_id: rows[result.winnerIndex]?.plan_id ?? null }
                : null,
        };
        if (mode === 'rank' && payload.recommendations) {
            payload.recommendations = result.rankOrder.map((index) => rows[index]);
        }
    }
    catch {
        try {
            metrics?.increment('ma_proposed_scoring_swallowed_error', 1, { stage: 'attach', mode });
        }
        catch { }
    }
}
