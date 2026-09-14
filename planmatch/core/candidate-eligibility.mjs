import { parseCmsMoney } from './recommendation-adapters.mjs';
import { normalizeRecommendPlanTypes } from './recommendation-request-normalization.mjs';
import { normalizeRecommendOfferRx } from './recommendation-request-normalization.mjs';
import { normalizeRecommendCsnpConditions } from './recommendation-request-normalization.mjs';
import { resolveRequestedCsnpKeys } from './csnp-condition-match.mjs';
import { normalizeRecommendCsnpConditionKeys } from './recommendation-request-normalization.mjs';
import { maPlanIncludesPartD } from './recommendation-adapters.mjs';
import { isCsnpPlan } from './csnp-condition-match.mjs';
import { normalizeSnpSegmentId } from './csnp-condition-match.mjs';
import { decideCsnpAdmission } from './csnp-condition-match.mjs';
export const CSNP_DROPPED_TRACE_CAP = 50;
export function emptyCsnpAdmission(request) {
    return {
        requested_keys: request.keys,
        request_source: request.source,
        unresolved_label_count: request.unresolvedLabelCount,
        lookup_failed: false,
        candidates: 0,
        admitted_matched: 0,
        admitted_lookup_failed: 0,
        current_plan_exempt: 0,
        dropped_unmatched: 0,
        dropped_no_filed_conditions: 0,
        dropped_no_requested_keys: 0,
        dropped: [],
    };
}
export function planIdentityKey(plan) {
    return `${plan.contract_id || ''}|${plan.plan_id || ''}|${plan.segment_id || '0'}`;
}
export function classifyDsnpEligibility({ profile, partialDual, sourceReportMonth, isCurrentPlan, }) {
    const hasAssistance = profile.assistance === 'yes';
    const partialOnly = profile.full_benefits === 'no'
        || (profile.full_benefits === null && profile.cost_sharing_covered === 'no');
    const fullBenefits = profile.assistance === 'yes' && profile.full_benefits === 'yes';
    const wouldSuppress = !hasAssistance || (partialOnly && partialDual === false);
    if (isCurrentPlan && wouldSuppress) {
        return {
            keep: true,
            eligibility: {
                partial_dual_accepted: partialDual,
                source_report_month: sourceReportMonth,
                status: 'current_plan_exempt',
                confirmation_required: true,
            },
        };
    }
    const uncertain = partialDual === null
        || profile.assistance === 'unsure'
        || (partialDual === false && !fullBenefits && !partialOnly);
    return {
        keep: !wouldSuppress,
        eligibility: {
            partial_dual_accepted: partialDual,
            source_report_month: sourceReportMonth,
            status: uncertain ? 'uncertain' : 'eligible',
            confirmation_required: uncertain,
        },
    };
}
export function filterCandidatePlans({ adaptedPlans, plan_types, offer_rx, body = {}, current_plan = null, hasMedicaid = false, medicaidProfile = null, admissionByPlan = new Map(), filedByPlan = new Map(), csnpLookupFailed = false, sourceReportMonth = null }) {
    const parseMoney = parseCmsMoney;
    const requestedPlanTypes = normalizeRecommendPlanTypes(plan_types);
    const requestedOfferRx = normalizeRecommendOfferRx(offer_rx);
    const requestedCsnpConditions = normalizeRecommendCsnpConditions(body);
    const plans = requestedPlanTypes.length
        ? adaptedPlans.filter((plan) => {
            const planType = String(plan.plan_type || '').toLowerCase();
            return requestedPlanTypes.some((requested) => planType.includes(requested));
        })
        : adaptedPlans;
    const hasCsnpConditions = requestedCsnpConditions.length > 0;
    const csnpRequest = resolveRequestedCsnpKeys({
        labels: requestedCsnpConditions,
        keys: normalizeRecommendCsnpConditionKeys(body),
    });
    const requestedCsnpConditionKeys = csnpRequest.keys;
    const currentPlanKey = current_plan
        ? String(current_plan.contract_id || '').trim() + '|' + String(current_plan.plan_id || '').trim()
        : null;
    const csnpAdmission = emptyCsnpAdmission(csnpRequest);
    csnpAdmission.lookup_failed = csnpLookupFailed;
    const plansToScore = plans.filter((plan) => {
        const snp = String(plan.snp_type || '').toLowerCase();
        const planKey = plan.contract_id + '|' + plan.plan_id;
        const isCurrentPlan = Boolean(currentPlanKey && planKey === currentPlanKey);
        const planHasPartD = maPlanIncludesPartD(plan.part_d_coverage);
        if (!isCurrentPlan && (requestedOfferRx === false ? planHasPartD : !planHasPartD)) {
            return false;
        }
        if (/i-?snp|institutional/i.test(snp)) {
            return isCurrentPlan;
        }
        if (/d-?snp|dual/i.test(snp)) {
            if (!medicaidProfile)
                return hasMedicaid || isCurrentPlan;
            const admission = admissionByPlan.get(planIdentityKey(plan));
            const decision = classifyDsnpEligibility({
                profile: medicaidProfile,
                partialDual: admission?.partialDual ?? null,
                sourceReportMonth: admission?.reportMonth ?? sourceReportMonth,
                isCurrentPlan,
            });
            plan.dsnp_eligibility = decision.eligibility;
            return decision.keep;
        }
        if (isCsnpPlan(plan)) {
            if (!hasCsnpConditions)
                return isCurrentPlan;
            const filed = filedByPlan.get(`${plan.contract_id || ''}|${plan.plan_id || ''}|${normalizeSnpSegmentId(plan.segment_id) ?? plan.segment_id ?? '0'}`) ?? null;
            const decision = decideCsnpAdmission({
                requested: requestedCsnpConditionKeys,
                filed,
                isCurrentPlan,
                lookupFailed: csnpLookupFailed,
            });
            plan.csnp_match = decision.match;
            plan.csnp_conditions_served = decision.served;
            csnpAdmission.candidates += 1;
            switch (decision.decision) {
                case 'matched':
                    csnpAdmission.admitted_matched += 1;
                    break;
                case 'lookup_failed':
                    csnpAdmission.admitted_lookup_failed += 1;
                    break;
                case 'current_plan_exempt':
                    csnpAdmission.current_plan_exempt += 1;
                    break;
                case 'unmatched':
                    csnpAdmission.dropped_unmatched += 1;
                    break;
                case 'no_filed_conditions':
                    csnpAdmission.dropped_no_filed_conditions += 1;
                    break;
                case 'no_requested_keys':
                    csnpAdmission.dropped_no_requested_keys += 1;
                    break;
            }
            if (!decision.keep && csnpAdmission.dropped.length < CSNP_DROPPED_TRACE_CAP) {
                csnpAdmission.dropped.push({
                    contract_id: plan.contract_id,
                    plan_id: plan.plan_id,
                    segment_id: plan.segment_id,
                    decision: decision.decision,
                    filed: filed?.filed ?? [],
                    source: filed?.source ?? 'none',
                });
            }
            return decision.keep;
        }
        return true;
    });
    const dedupMap = new Map();
    let dedupedCount = 0;
    for (const plan of plansToScore) {
        const key = plan.contract_id + '|' + plan.plan_id;
        const existing = dedupMap.get(key);
        if (existing) {
            dedupedCount++;
            const existPrem = parseMoney(existing.consolidated_premium) ?? parseMoney(existing.part_c_premium) ?? Infinity;
            const newPrem = parseMoney(plan.consolidated_premium) ?? parseMoney(plan.part_c_premium) ?? Infinity;
            if (newPrem < existPrem)
                dedupMap.set(key, plan);
        }
        else {
            dedupMap.set(key, plan);
        }
    }
    const dedupedPlans = Array.from(dedupMap.values());
    return { plans: dedupedPlans, dedupedCount, csnpAdmission };
}
