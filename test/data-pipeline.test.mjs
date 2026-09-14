import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCsvLine } from '../data-pipeline/formulary-csv.mjs';
import { normalizeDrugGenericFlag, normalizeDrugSearchResponseV2, normalizeDrugSearchResponseV3 } from '../data-pipeline/drug-normalization.mts';

test('CSV identifiers retain leading zeroes and empty fields retain their positions', () => {
  assert.deepEqual(parseCsvLine('"000123",,"00000000001",'), ['000123', '', '00000000001', '']);
});

test('quoted commas and escaped quotes remain within a CSV field', () => {
  assert.deepEqual(parseCsvLine('"Example, extended","Says ""example""",2'), ['Example, extended', 'Says "example"', '2']);
});

test('generic and brand flags normalize without turning unknown data into false', () => {
  for (const value of [true, 1, ' YES ', 'generic']) assert.equal(normalizeDrugGenericFlag(value), true);
  for (const value of [false, 0, ' NO ', 'brand']) assert.equal(normalizeDrugGenericFlag(value), false);
  for (const value of [null, undefined, '', 'unknown', 2]) assert.equal(normalizeDrugGenericFlag(value), null);
});

test('V2 normalizes both grouped and ungrouped drugs and preserves other fields', () => {
  const normalized = normalizeDrugSearchResponseV2({
    count: 2,
    drugs: [{ name: 'Example A', is_generic: '1' }],
    ungrouped: [{ name: 'Example B', is_generic: '0' }],
  });
  assert.deepEqual(normalized, {
    contract_version: 'v2', count: 2,
    drugs: [{ name: 'Example A', is_generic: true }],
    ungrouped: [{ name: 'Example B', is_generic: false }],
  });
});

test('V3 supplies missing metadata without mutating the source response', () => {
  const input = { drugs: [{ name: 'Example', is_generic: 'unknown' }] };
  const before = structuredClone(input);
  const normalized = normalizeDrugSearchResponseV3(input);
  assert.deepEqual(input, before);
  assert.notEqual(normalized.drugs[0], input.drugs[0]);
  assert.deepEqual(normalized, {
    contract_version: 'v3', ungrouped: [],
    drugs: [{ name: 'Example', is_generic: null, tty: null, ingredient_rxcui: null, ingredient_name: null, sibling_rxcuis: [], is_pack: false, generic_alternative: null }],
  });
});

test('absent drug lists become empty arrays', () => {
  assert.deepEqual(normalizeDrugSearchResponseV2({ drugs: null, ungrouped: null }), { contract_version: 'v2', drugs: [], ungrouped: [] });
});
