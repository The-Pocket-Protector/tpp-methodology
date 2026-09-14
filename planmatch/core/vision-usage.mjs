export const VISION_REPLACEMENTS_PER_YEAR = {
    yearly: 1,
    every_2_3_years: 0.4,
    rarely: 0.25,
};
export function visionEyewearClaimRate({ profile, planPeriodsPerYear }) {
    const planRate = Number.isFinite(planPeriodsPerYear) ? Math.max(0, planPeriodsPerYear) : 0;
    const cadence = profile?.replacement_cadence;
    if (!cadence)
        return planRate;
    return Math.min(planRate, VISION_REPLACEMENTS_PER_YEAR[cadence]);
}
export function visionEyewearAnnualValue({ perPeriodAllowance, planPeriodsPerYear, profile }) {
    const allowance = Number.isFinite(perPeriodAllowance) ? Math.max(0, perPeriodAllowance) : 0;
    return allowance * visionEyewearClaimRate({ profile, planPeriodsPerYear });
}
