export const SCORE_POLICY = 'score';
export const STRICT_ALL_IN_NETWORK_POLICY = 'strict_all_in_network';
export function parseProviderNetworkPolicy(value) {
    const policy = String(value || '').trim();
    if (!policy)
        return { policy: SCORE_POLICY, error: null };
    if (policy === SCORE_POLICY || policy === STRICT_ALL_IN_NETWORK_POLICY) {
        return { policy, error: null };
    }
    return { policy: null, error: 'Invalid provider_network_policy' };
}
export function numberValue(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
}
export function isStrictAllInNetworkPlan(plan, selectedDoctorCount) {
    const doctorCount = numberValue(selectedDoctorCount);
    if (doctorCount <= 0)
        return true;
    if (!plan)
        return false;
    const total = numberValue(plan.doctors_total);
    const inNetwork = numberValue(plan.doctors_in_network);
    const likely = numberValue(plan.doctors_likely_in_network);
    const crossReference = numberValue(plan.doctors_covered_via_cross_reference);
    const unknown = plan.doctor_requirements_unknown == null
        ? numberValue(plan.doctors_unknown)
        : numberValue(plan.doctor_requirements_unknown);
    return total === doctorCount
        && inNetwork + likely + crossReference === total
        && unknown === 0;
}
export function filterPlansForProviderNetworkPolicy(plans, options = {}) {
    const safePlans = Array.isArray(plans) ? plans : [];
    const policy = options.policy || SCORE_POLICY;
    const selectedDoctorCount = numberValue(options.selectedDoctorCount);
    if (policy !== STRICT_ALL_IN_NETWORK_POLICY || selectedDoctorCount <= 0) {
        return { filteredPlans: safePlans, removedCount: 0 };
    }
    const filteredPlans = safePlans.filter((plan) => isStrictAllInNetworkPlan(plan, selectedDoctorCount));
    return {
        filteredPlans,
        removedCount: safePlans.length - filteredPlans.length,
    };
}
