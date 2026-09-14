import { readFile } from 'node:fs/promises';
import { processDataset } from './index.mjs';

const [format, file, year] = process.argv.slice(2);
if (!format || !file) {
  console.error('Usage: node data-pipeline/cli.mjs <format> <input.csv> [plan-year]');
  process.exitCode = 1;
} else {
  try {
    const text = await readFile(file, 'utf8');
    const result = processDataset({ format, text, planYear: year === undefined ? undefined : Number(year) });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
