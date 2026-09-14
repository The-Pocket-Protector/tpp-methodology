import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { landscapeCsv } from '../examples/pipeline-fixtures.mjs';

test('local CSV runner returns JSON and fails a mismatched plan year', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tpp-methodology-'));
  try {
    const input = join(directory, 'synthetic.csv');
    writeFileSync(input, landscapeCsv);
    const cli = fileURLToPath(new URL('../data-pipeline/cli.mjs', import.meta.url));
    const valid = spawnSync(process.execPath, [cli, 'ma-landscape', input, '2026'], { encoding: 'utf8' });
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(JSON.parse(valid.stdout).records[0].plan_id, '001');
    const invalid = spawnSync(process.execPath, [cli, 'ma-landscape', input, '2027'], { encoding: 'utf8' });
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /VINTAGE MISMATCH/);
    assert.equal(invalid.stdout, '');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
