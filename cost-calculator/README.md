# Cost calculator

The application's drug-cost estimator, plan-value arithmetic, and Medigap premium-selection functions, extracted into runnable JavaScript. Import them from [index.mjs](index.mjs).

```sh
npm run demo:calculator
npm test
```

## What is calculated

| Function | Calculation |
| --- | --- |
| [`computeDrugOOP`](core/oop-estimator.mjs) | Annual out-of-pocket estimate for one drug from supplied cost-sharing terms, quantity, fill count, unit price, deductible, and plan year. Includes copay/coinsurance, pharmacy cascade, deductible straddle, and annual cap. |
| [`aggregatePlanDrugOOP`](core/oop-estimator.mjs) | Sums estimable drug results, caps the total, and reports whether any drugs could not be estimated. |
| [`getPlanAnnualCostValue`](core/ma-plan-value.mjs) | Uses a supplied annual cost, or annualizes plan premium and adds estimated drug cost. |
| [`getNetPlanAnnualCostAfterGivebackValue`](core/ma-plan-value.mjs) | Subtracts annual Part B giveback from that plan-cost figure. The source suppresses giveback when `hasMedicaid` is true. |
| [`getNetAnnualExposureAfterGivebackValue`](core/ma-plan-value.mjs) | Adds the supplied medical out-of-pocket maximum to the net plan-cost figure. This is an exposure measure, not expected medical spending. |
| [`getStandardPremium`, `getDiscountPremium`, `standardizeMedigapRows`](core/medigap-standard-rates.mjs) | Select standard premiums and separate discount values from supplied rate rows. Includes the original Plan G variant-selection rule. |
| [`getMedigapDisplayedPremium`](core/medigap-pricing.mjs) | Selects the displayed standard, preferred, or guaranteed-issue premium using the supplied status and available prices. It does not determine eligibility or underwriting. |

## A drug-cost example

```js
import { computeDrugOOP } from './cost-calculator/index.mjs';

const result = computeDrugOOP({
  benCostRow: {
    COST_TYPE_PREF: 'Coinsurance',
    COST_AMT_PREF: 0.25,
    DED_APPLIES_YN: 'Y',
  },
  nadacPrice: 10,
  quantity: 30,
  daysSupply: 30,
  deductible: 150,
  pharmacyCascade: ['retail_preferred'],
  planYear: 2026,
});
```

These are invented inputs. A fill costs $300 in this model. The first fill uses $150 of deductible plus 25% of the remaining $150; the next eleven fills cost $75 each. The returned annual estimate is $1,012.50. The output also includes the selected pharmacy combination, cost type and amount, fill count, and price per fill so the arithmetic can be inspected.

## Assumptions retained from the source

- Coinsurance is a decimal fraction: `0.25` means 25%. Callers supply valid, applicable plan terms. These functions are not comprehensive input validators.
- A copay without a deductible does not require a unit price. Other priced paths require a positive unit price. Missing required inputs return `estimable: false`, `oop: null`, and a reason.
- The default pharmacy cascade is mail preferred, mail standard, retail preferred, retail standard. Pass an explicit cascade to honor a stated pharmacy preference. `fallback` identifies the combination actually priced.
- Default annual fills are 12 for 30-day, 6 for 60-day, and 4 for 90-day supply. Other supply values fall back to 12 unless a positive `fillsPerYear` is supplied. This does not model actual adherence or a partial enrollment year.
- The per-drug calculation handles deductible crossing independently for each drug. Aggregation sums those results and applies a cap; it does not jointly simulate a shared deductible over dated prescriptions. It also does not implement every special drug, subsidy, or benefit exception.
- The aggregate can return a **partial subtotal** with `annualCostEstimable: false`. Check that flag and `unestimatedDrugCount`; do not present the subtotal as a complete estimate.
- The original aggregator uses the current calendar year of its runtime and has no plan-year argument. This snapshot registers only 2026 constants. `computeDrugOOP` accepts `planYear`; an unregistered year throws. Revisit constants and aggregation before using this release in another year.
- Legacy plan-value helpers treat missing premium/drug-cost values as zero. A supplied `annual_cost` takes precedence. These helpers cannot establish that a cost is known; caller-side completeness checks still matter. The later [PlanMatch cost-ranking stage](../planmatch/core/ranking.mjs) has its own required-cost checks.

The shared [Medicare constants](../shared/shared-medicare-constants.mjs) retain the application table. The Part D values originate from the [CMS 2026 redesign instructions](https://www.cms.gov/newsroom/fact-sheets/final-cy-2026-part-d-redesign-program-instructions). This release is a versioned calculation snapshot, not an automatically refreshed source of annual policy figures.

## Scope and provenance

The function bodies are retained from the application snapshot in [source-manifest.json](../source-manifest.json). TypeScript and internal comments are removed; imports are redirected. Existing breadcrumb calls use [a no-op telemetry adapter](../shared/telemetry.mjs). No calculation formula is replaced by a demonstration formula.

Callers provide applicable plan, pharmacy, formulary, pricing, and eligibility facts. Live price resolution, quote retrieval, rate datasets, and the complete application are outside this package. Premium-and-drug totals do not include every expense, such as the base Part B premium, IRMAA, or actual medical utilization. A giveback is a member benefit, not broker compensation; a negative net value is not a promise of a cash payment.
