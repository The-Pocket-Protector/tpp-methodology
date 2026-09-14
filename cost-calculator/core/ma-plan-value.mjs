export function numberValue(value) {
    if (value === null || value === undefined || value === '')
        return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}
export function roundMoney(value) {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : value;
}
export function getMonthlyPremiumValue(plan) {
    const premium = numberValue(plan?.monthly_premium);
    return premium !== null && premium > 0 ? premium : 0;
}
export function getPartBGivebackValue(plan, context = {}) {
    if (context?.hasMedicaid === true)
        return 0;
    const rawGiveback = plan?.part_b_giveback;
    const rawAmount = typeof rawGiveback === 'number'
        ? rawGiveback
        : rawGiveback?.amount ?? rawGiveback?.monthly_savings;
    const amount = numberValue(rawAmount);
    return amount !== null && amount > 0 ? amount : 0;
}
export function getEffectiveMonthlyPremiumValue(plan, context = {}) {
    return roundMoney(getMonthlyPremiumValue(plan) - getPartBGivebackValue(plan, context));
}
export function getAnnualCostValue(plan) {
    return numberValue(plan?.annual_cost);
}
export function getEstimatedAnnualDrugCostValue(plan) {
    const annualDrugCost = numberValue(plan?.estimated_annual_drug_cost);
    return annualDrugCost !== null && annualDrugCost > 0 ? annualDrugCost : 0;
}
export function getPlanAnnualCostValue(plan) {
    const annualCost = getAnnualCostValue(plan);
    if (annualCost !== null)
        return annualCost;
    return roundMoney((getMonthlyPremiumValue(plan) * 12) + getEstimatedAnnualDrugCostValue(plan));
}
export function getNetPlanAnnualCostAfterGivebackValue(plan, context = {}) {
    return roundMoney(getPlanAnnualCostValue(plan) - (getPartBGivebackValue(plan, context) * 12));
}
export function getNetAnnualExposureAfterGivebackValue(plan, context = {}) {
    const moop = numberValue(plan?.moop ?? plan?.moop_in_network);
    if (moop === null)
        return null;
    return roundMoney(getNetPlanAnnualCostAfterGivebackValue(plan, context) + moop);
}
export function getMonthlyValue(plan, context = {}) {
    return roundMoney(getPartBGivebackValue(plan, context)
        - getMonthlyPremiumValue(plan)
        - (getEstimatedAnnualDrugCostValue(plan) / 12));
}
