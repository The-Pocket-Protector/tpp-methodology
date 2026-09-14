// New standalone orchestration. The transformations it calls retain application logic.
import { parseCsv, stageFile } from './core/load-ma-landscape.mjs';
import * as nadac from './core/load-nadac-prices.mjs';
import * as mfp from './core/load-mfp-prices.mjs';
import { transformRow as transformNppesRow } from './core/load-nppes.mjs';
import { adaptPdpPlanInfoRows, adaptPdpFormularyDrugRows, normalizePdpBeneficiaryCostRow } from './core/recommendation-adapters.mjs';

export function processDataset({ format, text, planYear, expectedDrugFamilies } = {}) {
  if (typeof text !== 'string') throw new TypeError('Supply CSV text');
  if (format === 'ma-landscape') {
    if (!Number.isInteger(planYear)) throw new TypeError('Supply an integer planYear');
    return stageFile(text, planYear);
  }
  if (format === 'nadac' || format === 'mfp') {
    const source = format === 'nadac' ? nadac : mfp;
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
    const header = source.parseCsvLine(lines.shift() ?? '');
    const columns = source.buildColIdx(header);
    const rows = [];
    const rejected = [];
    for (const [index, line] of lines.entries()) {
      if (!line.trim()) continue;
      const result = source.transformRow(source.parseCsvLine(line), columns);
      if (result.row) rows.push(result.row);
      else rejected.push({ line: index + 2, reason: result.error ?? result.skip });
    }
    if (!rows.length && !rejected.length) throw new Error('No data rows');
    if (format === 'nadac') return { rows, rejected };
    if (rejected.length) throw new Error(`MFP transformation failed: ${JSON.stringify(rejected)}`);
    const { deduped, collisions } = mfp.dedupeDuplicateEffectiveRows(rows);
    const problems = [
      ...mfp.findDuplicateKeys(deduped),
      ...mfp.validatePriceRange(deduped),
      ...mfp.validateDrugFamilyCounts(deduped, expectedDrugFamilies),
    ];
    if (problems.length) throw new Error(`MFP validation failed: ${problems.join('; ')}`);
    return { rows: deduped, rejected, collisions };
  }
  if (!['pdp-plans', 'formulary', 'beneficiary-costs', 'nppes'].includes(format)) {
    throw new Error(`Unsupported format: ${format}`);
  }
  const [header, ...parsed] = parseCsv(text);
  if (!header?.length) throw new Error('Missing CSV header');
  const fields = parsed.filter(row => !(row.length === 1 && !row[0].trim()));
  if (format === 'nppes') {
    if (header[0]?.trim() !== 'NPI') throw new Error('Expected the NPPES NPI header');
    const rows = [], rejected = [];
    for (const [index, row] of fields.entries()) {
      const result = transformNppesRow(row);
      if (result.kind === 'skip') rejected.push({ index, reason: result.reason });
      else rows.push(result);
    }
    return { rows, rejected };
  }
  const names = header.map(name => name.trim());
  if (new Set(names).size !== names.length || names.some(name => !name)) {
    throw new Error('CSV headers must be nonempty and unique');
  }
  const records = fields.map((row, index) => {
    if (row.length !== names.length) throw new Error(`CSV record ${index + 1} has the wrong number of fields`);
    return Object.fromEntries(names.map((name, i) => [name, row[i]]));
  });
  if (format === 'pdp-plans') return adaptPdpPlanInfoRows(records);
  if (format === 'formulary') return adaptPdpFormularyDrugRows(records);
  // These are calculation terms, not complete storage rows: source IDs are not returned.
  return { rows: records.map(normalizePdpBeneficiaryCostRow), rejected: [] };
}
