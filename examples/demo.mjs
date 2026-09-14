import { rankPharmacySavingsPlans } from '../src/pharmacy-ranking.mts';
import { normalizeNonCareRankingWeights } from '../src/preference-weights.mts';
import { getEffectiveMonthlyPremiumValue } from '../src/premium-values.mts';

const base = { plan_type: 'mapd', pharmacy: { status: 'preferred' }, doctor_band: 'all_kept', drugs_covered: 2, drugs_total: 2, annual_cost_estimable: true };
const plans = [
  { ...base, id: 'sample-a', estimated_annual_total_cost: 1200 },
  { ...base, id: 'sample-b', estimated_annual_total_cost: 900 },
  { ...base, id: 'sample-unknown', estimated_annual_total_cost: null, annual_cost_estimable: false },
];
console.log('Synthetic pharmacy ranking:', rankPharmacySavingsPlans(plans).map(p => p.id));
console.log('Non-care preference weights:', normalizeNonCareRankingWeights({ premium: 1, benefits: 1 }));
console.log('Plan premium less giveback (not total healthcare cost):', getEffectiveMonthlyPremiumValue({ monthly_premium: 50, part_b_giveback: 20 }));
