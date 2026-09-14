// All identifiers, coverage findings and amounts are invented.
export const exampleSettings = {
  MA_PROPOSED_RANKING: 'rank', MA_GIVEBACK_RANKING: 'off',
  FEATURE_PROVIDER_COVERAGE_WEIGHT: 'off', FEATURE_EMPLOYER_COST_COMPARISON: 'off',
  PLANMATCH_W_PREMIUM: '12', PLANMATCH_W_OOP: '10',
  PLANMATCH_W_PHARMACY: '5', PLANMATCH_W_BENEFITS: '10',
  PLANMATCH_STAR_MULT: '1', PLANMATCH_PARTD_BONUS: '5', PLANMATCH_PROVIDER_BONUS: '15',
};
export const exampleInputs = { utilization: 'moderate', selectedBenefits: [], benefitChoices: {}, sessionLanguage: 'en' };
export function preparedPlan(id, overrides = {}) {
  return {
    contract_id: `sample-${id}`, plan_id: '001', segment_id: '0', plan_name: `Example ${id}`, carrier: 'Example carrier',
    plan_type: 'HMO', part_d_coverage: 'Yes', snp_type: '',
    monthly_premium: 50, consolidated_premium: '50', star_rating_overall: '4', star_rating: 4,
    moop: 5000, moop_in_network: '5000',
    doctors_total: 1, doctors_in_network: 1, doctors_likely_in_network: 0,
    doctors_covered_via_cross_reference: 0, doctor_requirements_unknown: 0,
    drugs_total: 1, drugs_covered: 1, annual_cost_estimable: true,
    cost_share: { pcp_copay_amount: 10, specialist_copay_amount: 40, urgent_care_copay_amount: 30, lab_copay_amount: 0 },
    ...overrides,
  };
}
export function rankedInput(id, annual = 1200, overrides = {}) {
  return { plan: preparedPlan(id, overrides), savings: { net_plan_annual_cost_after_giveback: annual, part_b_giveback_annual: 0 } };
}
