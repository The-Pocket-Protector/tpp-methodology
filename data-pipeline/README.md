# Data pipeline

The application's data transformation and validation functions, extracted into runnable JavaScript. Start with [index.mjs](index.mjs) or the [synthetic example](../examples/data-pipeline.mjs).

```sh
npm run demo:pipeline
node data-pipeline/cli.mjs ma-landscape path/to/landscape.csv 2026
node data-pipeline/cli.mjs nadac path/to/prices.csv
```

The CLI reads a supplied local file and writes JSON to standard output. It does not download data or write a database. Other supported formats are `mfp`, `pdp-plans`, `formulary`, `beneficiary-costs`, and `nppes`.

## Processing stages

| Input | Original processing logic | Output |
| --- | --- | --- |
| CMS MA landscape CSV | [Landscape staging](core/load-ma-landscape.mjs): named-header mapping, plan-year validation, key checks, and duplicate handling. | Records with staging counts. Wrong year, malformed keys, conflicting duplicates, and zero accepted rows halt processing. Short rows are counted and skipped. |
| PDP plan and formulary rows | [Recommendation adapters](core/recommendation-adapters.mjs): identifiers, plan metadata, formulary tiers, and restriction flags. | Normalized rows and rejected-row reasons. |
| Beneficiary cost rows | [Cost-term adapter](core/recommendation-adapters.mjs): cost types, amounts, and deductible flags. | Terms accepted by the cost calculator. These are not full storage rows; the original function does not return source identifiers. |
| NADAC price CSV | [NADAC transformation](core/load-nadac-prices.mjs): identifiers, unit prices, dates, and classification. | Price rows and skipped-row reasons. |
| MFP price CSV | [MFP processing](core/load-mfp-prices.mjs): NDC-11/NDC-9 identifiers, effective dates, prices, duplicate resolution, and validation. | Deduplicated rows and collision details; parsing or validation problems halt the runner. |
| NPPES provider CSV | [Provider transformation](core/load-nppes.mjs): practice-location address, primary taxonomy, and record lifecycle. | Normal, deactivation, and reactivation records; invalid rows are reported. This does not establish plan-network participation. |
| Drug-search responses | [Drug normalization](drug-normalization.mts): generic/brand flags and missing metadata. | Normalized API-shaped responses. This is a later response-processing stage, separate from file ingestion. |

For example:

```js
import { processDataset, adaptMaLandscapePlanRows } from './data-pipeline/index.mjs';

const staged = processDataset({ format: 'ma-landscape', text: csvText, planYear: 2026 });
const normalized = adaptMaLandscapePlanRows(staged.records);
// Inspect staged.stats and normalized.rejected before using normalized.rows.
```

The [example](../examples/data-pipeline.mjs) also passes a normalized beneficiary cost row and a transformed NADAC unit price into the real drug-cost calculator. It demonstrates the interface using an explicit synthetic pairing; it does not pretend to perform the application's lookup joins.

## Validation and input assumptions

MFP's default family expectations and price limits are retained from the source snapshot. For a deliberately different fixture, `processDataset` accepts `expectedDrugFamilies`; the example supplies an explicitly synthetic expectation. Updating real release expectations requires reviewing the source file, not disabling the check.

The source also exposes `checkLandscapeSize`, `pickBestCrosswalk`, and `buildRemovedMarkerRows`. Those require prior counts or records supplied by the caller; the CLI does not query prior database state or perform production refresh operations. Do not apply removed markers to a store without validating a complete replacement release.

Several source behaviors matter when reusing these functions:

- Landscape CSV parsing supports quoted newlines and a BOM. The NADAC, MFP, and original formulary line parsers assume one record per line. These parsers do not fully validate malformed CSV quoting.
- The NADAC date helper checks date shape and basic day/month ranges; it is not a complete calendar validator. Its numeric check also does not reject a negative unit price. These behaviors are retained, not silently repaired in this export.
- Recommendation adapters preserve source defaults: missing PDP premiums become `'0'`, and unrecognized yes/no values become `'N'`. Inspect the source before treating a default as verified information.
- NPPES transformation expects the source's 330-column layout and fixed positions. Its checks do not make an arbitrary file or future layout compatible.
- Whole-file staging and the standalone runner hold data in memory. This is not the application's streaming/batched loading system.

## Extraction boundaries

The functions in `core/` retain their application runtime bodies. Imports and exports are adapted for this repository; breadcrumb telemetry is replaced with [a no-op](../shared/telemetry.mjs). The formulary parser and response normalizers retain their previously published bodies. Source paths, declarations, hashes, and adaptations are recorded in [the manifest](../source-manifest.json).

[process-dataset.mjs](process-dataset.mjs) and [cli.mjs](cli.mjs) are new standalone orchestration. They expose the processing core without bundling source discovery, downloads, credentials, database schemas and writes, operational scheduling, provider-network crawling, licensed datasets, or the complete enrichment/join process. No placeholder service endpoints are used.
