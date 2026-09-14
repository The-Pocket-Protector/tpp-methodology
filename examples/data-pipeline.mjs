import { processDataset, adaptMaLandscapePlanRows, normalizePdpBeneficiaryCostRow } from '../data-pipeline/index.mjs';
import { computeDrugOOP } from '../cost-calculator/index.mjs';
import { landscapeCsv, nadacCsv, mfpCsv, expectedSyntheticFamilies } from './pipeline-fixtures.mjs';

const landscape = processDataset({ format: 'ma-landscape', text: landscapeCsv, planYear: 2026 });
const nadac = processDataset({ format: 'nadac', text: nadacCsv });
const mfp = processDataset({ format: 'mfp', text: mfpCsv, expectedDrugFamilies: expectedSyntheticFamilies });
const terms = normalizePdpBeneficiaryCostRow({ cost_type_pref: '2', cost_amt_pref: '0.25', ded_applies_yn: 'Y' });

// Explicit synthetic pairing, not a substitute for the application's plan/drug lookups.
const drugCost = computeDrugOOP({
  benCostRow: terms, nadacPrice: nadac.rows[0].nadac_per_unit,
  quantity: 30, daysSupply: 30, deductible: 150,
  pharmacyCascade: ['retail_preferred'], planYear: 2026,
});
console.log(JSON.stringify({
  label: 'Synthetic pipeline and calculator inputs; not live data',
  landscape, normalizedPlans: adaptMaLandscapePlanRows(landscape.records),
  nadac, mfp, normalizedCostTerms: terms, drugCost,
}, null, 2));
