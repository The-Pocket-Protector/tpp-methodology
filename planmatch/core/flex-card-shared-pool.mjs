import { currentPlanYear } from './medicare-constants.mjs';
export function paddedPlanId(planId) {
    return String(planId).padStart(3, '0');
}
export function poolKey(contractId, planId, planYear) {
    return `${contractId}|${paddedPlanId(planId)}|${planYear}`;
}
export function lookup(contractId, planId, planYear) {
    if (typeof contractId !== 'string' || contractId === '' || planId === undefined || planId === null)
        return undefined;
    return SHARED_POOL.get(poolKey(contractId, planId, planYear));
}
export function sharedDentalScopeFor(contractId, planId, ctx = {}) {
    const entry = lookup(contractId, planId, ctx.planYear ?? currentPlanYear());
    if (!entry?.lane_guards)
        return null;
    const dentalGuarded = entry.lane_guards['dvh_summary.dental_max_benefit']
        ?? entry.lane_guards['decoded.plan_benefit_max_amount']
        ?? entry.lane_guards['decoded.max_coverage_amount'];
    if (dentalGuarded === undefined)
        return null;
    const pot = Number(dentalGuarded);
    if (!Number.isFinite(pot) || pot <= 0)
        return null;
    return { applies_to: entry.applies_to, dental_pot: pot };
}
export let SHARED_POOL;
export function supplySharedPool(entries) { if (!(entries instanceof Map))
    throw new TypeError("Supply a reviewed shared-pool Map explicitly"); SHARED_POOL = entries; }
