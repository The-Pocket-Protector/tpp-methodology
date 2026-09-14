import { parseCsvLine } from '../data-pipeline/formulary-csv.mjs';
import { normalizeDrugSearchResponseV3 } from '../data-pipeline/drug-normalization.mts';

// Invented, independent examples; the CSV output does not feed the response below.
const header = 'FORMULARY_ID,RXCUI,NDC,TIER_LEVEL_VALUE';
const row = '"000123","000456","00000000001","2"';
console.log('Synthetic formulary headers:', parseCsvLine(header));
console.log('Synthetic formulary fields (identifiers stay strings):', parseCsvLine(row));

const response = {
  drugs: [
    { rxcui: 'sample-generic', name: 'Example generic drug', is_generic: 'generic' },
    { rxcui: 'sample-brand', name: 'Example brand drug', is_generic: 'brand' },
    { rxcui: 'sample-unknown', name: 'Example unknown drug', is_generic: 'unknown' },
  ],
  ungrouped: [],
};
console.log('Synthetic normalized drug response:', JSON.stringify(normalizeDrugSearchResponseV3(response), null, 2));
