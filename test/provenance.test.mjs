import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';

test('published source and standalone adapters match the reviewed manifest', async () => {
  const manifest = JSON.parse(await readFile(new URL('../source-manifest.json', import.meta.url), 'utf8'));
  const entries = [...manifest.modules, ...manifest.standaloneAdapters];
  assert.equal(new Set(entries.map(entry => entry.file)).size, entries.length);
  for (const entry of entries) {
    const bytes = await readFile(new URL('../' + entry.file, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.publishedFileSha256, entry.file);
  }
});
