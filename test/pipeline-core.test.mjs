import assert from 'node:assert/strict';
import test from 'node:test';
import { processDataset, adaptMaLandscapePlanRows, checkLandscapeSize, transformNppesRow, pickBestCrosswalk, buildRemovedMarkerRows } from '../data-pipeline/index.mjs';
import { landscapeCsv, landscapeHeaders, landscapeRow, csv, nadacCsv, mfpCsv, mfpHeaders, mfpRow, expectedSyntheticFamilies } from '../examples/pipeline-fixtures.mjs';

test('landscape staging preserves keys, normalizes whitespace, and collapses identical duplicates', () => {
  const result = processDataset({ format: 'ma-landscape', text: csv([landscapeHeaders, landscapeRow, landscapeRow]), planYear: 2026 });
  assert.equal(result.records.length, 1);
  assert.equal(result.stats.duplicatePk, 1);
  assert.equal(result.records[0].plan_id, '001');
  const adapted = adaptMaLandscapePlanRows(result.records);
  assert.deepEqual(adapted.rejected, []);
  assert.equal(adapted.rows[0].contract_id, 'H0000');
  assert.equal(adapted.rows[0].consolidated_premium, '20');
});

test('landscape rejects wrong plan year, changed headers, and conflicting duplicate keys', () => {
  assert.throws(() => processDataset({ format: 'ma-landscape', text: landscapeCsv, planYear: 2027 }), /VINTAGE MISMATCH/);
  assert.throws(() => processDataset({ format: 'ma-landscape', text: landscapeCsv.replace('Contract ID', 'Renamed ID'), planYear: 2026 }), /required column/);
  const changed = [...landscapeRow]; changed[14] = '30';
  assert.throws(() => processDataset({ format: 'ma-landscape', text: csv([landscapeHeaders, landscapeRow, changed]), planYear: 2026 }), /CONFLICTING/);
});

test('landscape reports short rows and halts for malformed keys', () => {
  const result = processDataset({ format: 'ma-landscape', text: landscapeCsv + '\nshort,row', planYear: 2026 });
  assert.equal(result.stats.skipReasons.short_row, 1);
  const bad = [...landscapeRow]; bad[1] = '1';
  assert.throws(() => processDataset({ format: 'ma-landscape', text: csv([landscapeHeaders, bad]), planYear: 2026 }), /PK shape/);
});

test('NADAC produces normalized price rows and explains skipped rows', () => {
  const result = processDataset({ format: 'nadac', text: nadacCsv });
  assert.equal(result.rows[0].ndc, '00000000001');
  assert.equal(result.rows[0].drug_name, 'Synthetic, example drug');
  assert.equal(result.rows[0].nadac_per_unit, 10);
  assert.equal(result.rows[0].effective_date, '2026-01-01');
  assert.deepEqual(result.rejected, [{ line: 3, reason: 'blank_ndc' }]);
});

test('MFP validates the supplied family expectation and keeps open-ended effective records', () => {
  const closed = [...mfpRow]; closed[4] = '12/31/2026';
  const result = processDataset({ format: 'mfp', text: csv([mfpHeaders, closed, mfpRow]), expectedDrugFamilies: expectedSyntheticFamilies });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].ndc11, '00000000001');
  assert.equal(result.rows[0].price_applicability_to, null);
  assert.equal(result.collisions.length, 1);
  assert.throws(() => processDataset({ format: 'mfp', text: mfpCsv, expectedDrugFamilies: { 2026: ['DIFFERENT FAMILY'] } }), /missing expected/);
});

test('MFP halts on malformed identifiers and out-of-range prices', () => {
  assert.throws(() => processDataset({ format: 'mfp', text: mfpCsv.replace('00000-0000-01', '123'), expectedDrugFamilies: expectedSyntheticFamilies }), /bad_ndc11/);
  const bad = [...mfpRow]; bad[5] = '99999';
  assert.throws(() => processDataset({ format: 'mfp', text: csv([mfpHeaders, bad]), expectedDrugFamilies: expectedSyntheticFamilies }), /outside/);
});

test('formulary adaptation preserves leading zeros and reports invalid tiers by row', () => {
  const result = processDataset({ format: 'formulary', text: 'FORMULARY_ID,RXCUI,TIER_LEVEL_VALUE,NDC,PRIOR_AUTHORIZATION_YN\n00001,000123,2,00000000001,Y\n00001,000124,0,00000000002,N' });
  assert.equal(result.rows[0].RXCUI, '000123');
  assert.equal(result.rows[0].PRIOR_AUTHORIZATION_YN, 'Y');
  assert.deepEqual(result.rejected, [{ index: 1, reason: 'invalid TIER_LEVEL_VALUE' }]);
});

test('PDP input normalization retains the source missing-premium default', () => {
  const result = processDataset({ format: 'pdp-plans', text: 'CONTRACT_ID,PLAN_ID,PREMIUM\ns0000,1,\n,2,10' });
  assert.equal(result.rows[0].PLAN_ID, '001');
  assert.equal(result.rows[0].PREMIUM, '0');
  assert.equal(result.rejected[0].reason, 'missing CONTRACT_ID');
});

test('beneficiary cost terms normalize unknown money without inventing an amount', () => {
  const result = processDataset({ format: 'beneficiary-costs', text: 'COST_TYPE_PREF,COST_AMT_PREF,DED_APPLIES_YN\n2,0.25,Y\n1,N/A,N' });
  assert.equal(result.rows[0].COST_TYPE_PREF, 'Coinsurance');
  assert.equal(result.rows[0].COST_AMT_PREF, 0.25);
  assert.equal(result.rows[1].COST_AMT_PREF, null);
});

test('NPPES uses practice location and the taxonomy marked primary', () => {
  const row = Array(330).fill('');
  row[0] = '0000000001'; row[1] = '1';
  row[20] = 'Example mailing address'; row[28] = 'Example practice address';
  row[47] = 'FIRST'; row[51] = 'PRIMARY'; row[54] = 'Y';
  const result = transformNppesRow(row);
  assert.equal(result.kind, 'normal');
  assert.equal(result.address_line1, 'Example practice address');
  assert.equal(result.provider_taxonomy_1, 'PRIMARY');
  assert.equal(result.provider_taxonomy_desc_1, null);
});

test('NPPES distinguishes deactivation, reactivation, and invalid input', () => {
  const row = Array(330).fill(''); row[0] = '0000000001'; row[39] = '01/01/2026';
  assert.equal(transformNppesRow(row).kind, 'deactivation');
  row[1] = '1'; row[40] = '02/01/2026';
  assert.equal(transformNppesRow(row).kind, 'reactivation');
  assert.equal(transformNppesRow(['invalid']).kind, 'skip');
});

test('drug crosswalk resolution prefers a direct match over an ingredient relation', () => {
  const ingredient = { external_rxcui: '000123', relation_type: 'ingredient', rxcui: '000124' };
  const direct = { external_rxcui: '000123', relation_type: 'self', rxcui: '000123' };
  assert.deepEqual(pickBestCrosswalk([ingredient, direct]).get('000123'), direct);
});

test('the prior-lineup guard detects a large loss of accepted rows', () => {
  assert.equal(checkLandscapeSize(89, 100).ok, false);
  assert.equal(checkLandscapeSize(90, 100).ok, true);
  assert.equal(checkLandscapeSize(1, 0).ok, true);
});

test('removed-price markers only describe identifiers absent from the supplied complete set', () => {
  const prior = [{ ndc11: '00000000001', drug_name: 'Synthetic A', ipay_year: 2026 }, { ndc11: '00000000002', drug_name: 'Synthetic B', ipay_year: 2026 }];
  const markers = buildRemovedMarkerRows(prior, new Set(['00000000001']), '2026-06-01');
  assert.equal(markers.length, 1);
  assert.equal(markers[0].ndc11, '00000000002');
  assert.equal(markers[0].status, 'removed');
  assert.equal(markers[0].mfp_per_unit_ndc9, null);
});
