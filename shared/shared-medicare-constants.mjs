export const CONSTANTS_2026 = Object.freeze({
    plan_year: 2026,
    cms_source_date: '2025-11-19',
    cms_source_url: 'https://www.federalregister.gov/documents/2025/11/19/2025-20251/',
    part_a: Object.freeze({
        inpatient_deductible: 1736,
        coinsurance_day_61_90: 434,
        coinsurance_day_91_150_lifetime_reserve: 868,
        snf_coinsurance_day_21_100: 217,
        base_premium_monthly: 565,
        base_premium_with_10pct_late_enrollment_surcharge: 621.50,
        reduced_premium_30_39_quarters_monthly: 311,
        reduced_premium_with_10pct_late_enrollment_surcharge: 342.10,
    }),
    part_b: Object.freeze({
        standard_premium_monthly: 202.90,
        annual_deductible: 283,
        coinsurance_rate: 0.20,
        immunosuppressive_drug_only_premium_monthly: 121.60,
        pro_rata_first_month: 191.17,
        pro_rata_second_month: 91.83,
    }),
    part_d: Object.freeze({
        max_deductible: 615,
        annual_oop_cap: 2100,
        national_base_beneficiary_premium: 38.99,
    }),
    extra_help: Object.freeze({
        income_limit_individual: 23940,
        income_limit_married: 32460,
        resource_limit_individual: 18090,
        resource_limit_married: 36100,
        generic_copay_max: 5.10,
        brand_copay_max: 12.65,
        qmb_copay_max: 4.90,
    }),
    medicare_savings_programs: Object.freeze({
        single: Object.freeze({
            qmb: Object.freeze({ monthlyIncome: 1350, asset: 9950 }),
            slmb: Object.freeze({ monthlyIncome: 1616, asset: 9950 }),
            qi: Object.freeze({ monthlyIncome: 1816, asset: 9950 }),
            qdwi: Object.freeze({ monthlyIncome: 5405, asset: 4000 }),
        }),
        married: Object.freeze({
            qmb: Object.freeze({ monthlyIncome: 1824, asset: 14910 }),
            slmb: Object.freeze({ monthlyIncome: 2184, asset: 14910 }),
            qi: Object.freeze({ monthlyIncome: 2455, asset: 14910 }),
            qdwi: Object.freeze({ monthlyIncome: 7299, asset: 6000 }),
        }),
    }),
    irmaa: Object.freeze({
        magi_filing_year: 2024,
        brackets: Object.freeze([
            Object.freeze({ tier: 1, magi_individual_max: 109000, magi_joint_max: 218000, magi_mfs_max: 109000, part_b_irmaa: 0.00, part_b_total: 202.90, part_d_irmaa: 0.00 }),
            Object.freeze({ tier: 2, magi_individual_max: 137000, magi_joint_max: 274000, magi_mfs_max: null, part_b_irmaa: 81.20, part_b_total: 284.10, part_d_irmaa: 14.50 }),
            Object.freeze({ tier: 3, magi_individual_max: 171000, magi_joint_max: 342000, magi_mfs_max: null, part_b_irmaa: 202.90, part_b_total: 405.80, part_d_irmaa: 37.50 }),
            Object.freeze({ tier: 4, magi_individual_max: 205000, magi_joint_max: 410000, magi_mfs_max: null, part_b_irmaa: 324.60, part_b_total: 527.50, part_d_irmaa: 60.40 }),
            Object.freeze({ tier: 5, magi_individual_max: 500000, magi_joint_max: 750000, magi_mfs_max: 391000, part_b_irmaa: 446.30, part_b_total: 649.20, part_d_irmaa: 83.30 }),
            Object.freeze({ tier: 6, magi_individual_max: Infinity, magi_joint_max: Infinity, magi_mfs_max: Infinity, part_b_irmaa: 487.00, part_b_total: 689.90, part_d_irmaa: 91.00 }),
        ]),
    }),
});
export const CONSTANTS_BY_YEAR = Object.freeze({
    2026: CONSTANTS_2026,
});
export function currentPlanYear(now = new Date()) {
    return now.getFullYear();
}
export function getMedicareConstants(planYear = currentPlanYear()) {
    const constants = CONSTANTS_BY_YEAR[planYear];
    if (!constants) {
        throw new Error(`No Medicare constants registered for plan year ${planYear}. Update packages/contracts/src/medicare-constants.ts.`);
    }
    return constants;
}
export const getMedicareConstantsStrict = getMedicareConstants;
