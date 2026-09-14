import assert from 'node:assert/strict';
import test from 'node:test';
import { rankPharmacySavingsPlans } from '../src/pharmacy-ranking.mts';
import { normalizeNonCareRankingWeights } from '../src/preference-weights.mts';
import { getEffectiveMonthlyPremiumValue, getPartBGivebackValue } from '../src/premium-values.mts';

const plan = (id, extra = {}) => ({ id, plan_type: 'mapd', pharmacy: { status: 'preferred' }, doctor_band: 'all_kept', drugs_covered: 2, drugs_total: 2, estimated_annual_total_cost: 1000, annual_cost_estimable: true, ...extra });
const ids = plans => rankPharmacySavingsPlans(plans).map(p => p.id);

test('confirmed pharmacy data comes before a cheaper plan with missing data', () => {
  assert.deepEqual(ids([plan('gap', { pharmacy: { status: 'data_gap' }, estimated_annual_total_cost: 1 }), plan('known')]), ['known', 'gap']);
});
test('doctor and drug coverage take precedence over a cheaper cost', () => {
  assert.deepEqual(ids([plan('lost-doctor', { doctor_band: 'some_lost', estimated_annual_total_cost: 1 }), plan('lost-drug', { drugs_covered: 1, estimated_annual_total_cost: 1 }), plan('coverage')]), ['coverage', 'lost-drug', 'lost-doctor']);
});
test('unknown costs never sort as free within the same coverage band', () => {
  assert.deepEqual(ids([plan('unknown', { estimated_annual_total_cost: null, annual_cost_estimable: false }), plan('known')]), ['known', 'unknown']);
});
test('equal plans preserve source order and the input array is not mutated', () => {
  const input = [plan('first'), plan('second')];
  const result = rankPharmacySavingsPlans(input);
  assert.notEqual(result, input);
  assert.deepEqual(result, input);
});
test('additional broker-payment properties do not change this function’s ordering', () => {
  const input = [plan('expensive', { estimated_annual_total_cost: 2000 }), plan('cheaper')];
  const enriched = input.map((p, i) => ({ ...p, broker_payment: i === 0 ? 1000000 : 0 }));
  assert.deepEqual(ids(enriched), ids(input));
});
test('weights discard negative input and normalize positive preferences', () => {
  assert.deepEqual(normalizeNonCareRankingWeights({ premium: 3, benefits: 1, out_of_pocket: -100 }), { premium: 75, benefits: 25, out_of_pocket: 0, pharmacy_network: 0 });
});
test('zero weights use the source defaults normalized to a total of 100', () => {
  const weights = normalizeNonCareRankingWeights({});
  assert.ok(Math.abs(Object.values(weights).reduce((sum, x) => sum + x, 0) - 100) < 1e-10);
  assert.ok(weights.premium > weights.pharmacy_network);
});
test('giveback is suppressed for a Medicaid context in the selected source function', () => {
  assert.equal(getPartBGivebackValue({ part_b_giveback: { amount: 20 } }, { hasMedicaid: true }), 0);
});
test('premium arithmetic can be negative and does not represent total healthcare cost', () => {
  assert.equal(getEffectiveMonthlyPremiumValue({ monthly_premium: 10, part_b_giveback: 20 }), -10);
  assert.equal(getEffectiveMonthlyPremiumValue({ monthly_premium: 50, part_b_giveback: 20 }), 30);
});
