import { computeDrugOOP, getPlanAnnualCostValue, getNetPlanAnnualCostAfterGivebackValue, getMedigapDisplayedPremium } from '../cost-calculator/index.mjs';

// Invented prices and terms. No person, carrier quote, or live lookup is represented.
const drug = computeDrugOOP({
  benCostRow: { COST_TYPE_PREF: 'Coinsurance', COST_AMT_PREF: 0.25, DED_APPLIES_YN: 'Y' },
  nadacPrice: 10, quantity: 30, daysSupply: 30, deductible: 150,
  pharmacyCascade: ['retail_preferred'], planYear: 2026,
});
const plan = { monthly_premium: 20, estimated_annual_drug_cost: drug.oop, part_b_giveback: 10 };
console.log(JSON.stringify({
  label: 'Synthetic arithmetic example; not a quote',
  drug,
  premiumAndDrugCost: drug.estimable ? getPlanAnnualCostValue(plan) : null,
  afterGiveback: drug.estimable ? getNetPlanAnnualCostAfterGivebackValue(plan) : null,
  medigapStandard: getMedigapDisplayedPremium({ standard_monthly_premium: 150, preferred_discount_premium: 120 }, ''),
  medigapPreferred: getMedigapDisplayedPremium({ standard_monthly_premium: 150, preferred_discount_premium: 120 }, 'no'),
}, null, 2));
