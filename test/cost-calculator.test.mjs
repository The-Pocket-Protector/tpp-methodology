import assert from 'node:assert/strict';
import test from 'node:test';
import { computeDrugOOP, aggregatePlanDrugOOP, getPlanAnnualCostValue, getNetPlanAnnualCostAfterGivebackValue, getNetAnnualExposureAfterGivebackValue, getStandardPremium, getDiscountPremium, getMedigapDisplayedPremium, standardizeMedigapRows } from '../cost-calculator/index.mjs';

const base = { quantity: 30, daysSupply: 30, planYear: 2026, nadacPrice: 10, deductible: 150, pharmacyCascade: ['retail_preferred'] };
const terms = (type = 'Copay', amount = 20, deductible = 'N') => ({ COST_TYPE_PREF: type, COST_AMT_PREF: amount, DED_APPLIES_YN: deductible });

test('a deductible-exempt copay is estimable without a unit price', () => {
  const result = computeDrugOOP({ ...base, nadacPrice: null, benCostRow: terms() });
  assert.equal(result.oop, 240);
  assert.equal(result.estimable, true);
  assert.equal(result.fullPricePerFill, null);
  assert.equal(result.fillsPriced, 12);
});

test('the cascade skips not-applicable terms and honors a stated pharmacy choice', () => {
  const row = { ...terms(), COST_TYPE_MAIL_PREF: 0, COST_AMT_MAIL_PREF: 0, COST_TYPE_MAIL_NONPREF: 'Copay', COST_AMT_MAIL_NONPREF: 10 };
  const defaultResult = computeDrugOOP({ ...base, pharmacyCascade: undefined, benCostRow: row });
  assert.equal(defaultResult.fallback, 'mail_standard');
  assert.equal(defaultResult.oop, 120);
  assert.equal(computeDrugOOP({ ...base, benCostRow: row }).oop, 240);
});

test('coinsurance is a fraction of fill price and uses the deductible straddle', () => {
  // 12 fills × $300. First fill: $150 deductible + 25% of $150 = $187.50;
  // remaining 11 fills: 11 × $75 = $825. Total: $1,012.50.
  const result = computeDrugOOP({ ...base, benCostRow: terms('Coinsurance', 0.25, 'Y') });
  assert.equal(result.oop, 1012.5);
  assert.equal(result.fullPricePerFill, 300);
  assert.equal(result.costAmt, 0.25);
});

test('copay straddle and 90-day fill counts retain source arithmetic', () => {
  assert.equal(computeDrugOOP({ ...base, benCostRow: terms('Copay', 20, 'Y') }).oop, 390);
  assert.equal(computeDrugOOP({ ...base, daysSupply: 90, benCostRow: terms() }).oop, 80);
  assert.equal(computeDrugOOP({ ...base, fillsPerYear: 3, benCostRow: terms() }).oop, 60);
});

test('annual cap limits a priced drug and marks that the cap was reached', () => {
  const result = computeDrugOOP({ ...base, benCostRow: terms('Copay', 500) });
  assert.equal(result.oop, 2100);
  assert.equal(result.iraCapReached, true);
});

test('missing required inputs produce an unestimable result rather than a free drug', () => {
  const missingPrice = computeDrugOOP({ ...base, nadacPrice: null, benCostRow: terms('Coinsurance', 0.25) });
  assert.equal(missingPrice.oop, null);
  assert.equal(missingPrice.fallback, 'no_nadac');
  assert.equal(computeDrugOOP({ ...base, quantity: 0, benCostRow: terms() }).fallback, 'missing_quantity');
  assert.equal(computeDrugOOP({ ...base, deductible: null, benCostRow: terms('Copay', 20, 'Y') }).fallback, 'missing_deductible');
  assert.equal(computeDrugOOP(base).fallback, 'no_cost_data');
});

test('unsupported plan-year constants fail instead of silently using another year', () => {
  assert.throws(() => computeDrugOOP({ ...base, planYear: 2099, benCostRow: terms() }), /2099/);
});

test('aggregation caps a complete total and flags a partial total', t => {
  // The original aggregator uses the runtime's current year, with no plan-year argument.
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-06-01T00:00:00Z') });
  assert.deepEqual(aggregatePlanDrugOOP('synthetic', [{ estimable: true, oop: 1500 }, { estimable: true, oop: 1500 }]), { annualCost: 2100, annualCostEstimable: true, unestimatedDrugCount: 0 });
  assert.deepEqual(aggregatePlanDrugOOP('synthetic', [{ estimable: true, oop: 240 }, null]), { annualCost: 240, annualCostEstimable: false, unestimatedDrugCount: 1 });
  assert.deepEqual(aggregatePlanDrugOOP('synthetic', []), { annualCost: null, annualCostEstimable: false, unestimatedDrugCount: 0 });
});

test('annual premium and drug total, giveback, Medicaid suppression, and exposure are distinct', () => {
  const plan = { monthly_premium: 20, estimated_annual_drug_cost: 240, part_b_giveback: 10, moop: 5000 };
  assert.equal(getPlanAnnualCostValue(plan), 480);
  assert.equal(getNetPlanAnnualCostAfterGivebackValue(plan), 360);
  assert.equal(getNetPlanAnnualCostAfterGivebackValue(plan, { hasMedicaid: true }), 480);
  assert.equal(getNetAnnualExposureAfterGivebackValue(plan), 5360);
  assert.equal(getPlanAnnualCostValue({ ...plan, annual_cost: 100 }), 100);
});

test('legacy premium helpers retain their missing-drug-cost zero fallback', () => {
  assert.equal(getPlanAnnualCostValue({ monthly_premium: 20, estimated_annual_drug_cost: null }), 240);
  assert.equal(getNetAnnualExposureAfterGivebackValue({ monthly_premium: 20 }), null);
});

test('Medigap standard premiums and discounts remain separate with unknowns preserved', () => {
  const plan = { standard_monthly_premium: 150, household_discount_premium: 130 };
  assert.equal(getStandardPremium(plan), 150);
  assert.equal(getDiscountPremium(plan), 130);
  assert.equal(getDiscountPremium({ ...plan, household_discount_premium: 160 }), null);
  assert.equal(getStandardPremium({}), null);
  const variants = standardizeMedigapRows([
    { carrier_name: 'Synthetic (Preferred)', plan_letter: 'G', premium_high: 120 },
    { carrier_name: 'Synthetic (Standard)', plan_letter: 'G', premium_high: 150 },
  ], 'G');
  assert.equal(variants.length, 1);
  assert.equal(variants[0].standard_monthly_premium, 150);
  assert.equal(variants[0].preferred_discount_premium, 120);
});

test('Medigap displayed premium follows the supplied guaranteed-issue status', () => {
  const plan = { standard_monthly_premium: 150, preferred_discount_premium: 120, gi_issue_monthly_premium: 160 };
  assert.deepEqual(getMedigapDisplayedPremium(plan, ''), { monthly: 150, basis: 'standard' });
  assert.deepEqual(getMedigapDisplayedPremium(plan, 'no'), { monthly: 120, basis: 'preferred' });
  assert.deepEqual(getMedigapDisplayedPremium(plan, 'yes'), { monthly: 160, basis: 'gi' });
  assert.deepEqual(getMedigapDisplayedPremium({}, ''), { monthly: null, basis: 'unknown' });
});
