# The Pocket Protector Methodology

Open-source decision rules, data transformations, and cost calculations extracted from The Pocket Protector application. Licensed under [MIT](LICENSE), with runnable examples, tests, and a [source manifest](source-manifest.json).

| Module | What is included |
| --- | --- |
| [PlanMatch](planmatch/) | Candidate eligibility, doctor and drug evidence, benefit and pharmacy scoring, preference ranking, care filters, and the cost-ranking/stay-or-switch model. |
| [Data pipeline](data-pipeline/) | CMS landscape staging, plan and formulary normalization, NADAC and MFP price transformations and validation, NPPES provider-record transformation, and drug-response normalization. Includes a local CSV-to-JSON runner. |
| [Cost calculator](cost-calculator/) | Part D drug out-of-pocket estimates, deductible/copay/coinsurance rules, annual caps, premium and giveback arithmetic, and Medigap premium selection. |

These are the core functions from a recorded application source snapshot, with the standalone adaptations documented below. They do not include the complete website, live data feeds, database operations, or production configuration. Each module explains its inputs and boundaries.

## Run it

Use Node.js 22.18 or newer. No Python, package installation, credentials, or database is needed.

```sh
git clone https://github.com/The-Pocket-Protector/tpp-methodology.git
cd tpp-methodology
npm run demo:planmatch
npm run demo:pipeline
npm run demo:calculator
npm test
```

Import a module directly:

```js
import { computeDrugOOP } from './cost-calculator/index.mjs';
import { processDataset } from './data-pipeline/index.mjs';
import { runProposedRanking } from './planmatch/index.mjs';
```

The examples use invented plans, identifiers, prices, and settings. They are not quotes or real member records. The original small [pharmacy-ranking](src/pharmacy-ranking.mts), [preference-weight](src/preference-weights.mts), and [premium](src/premium-values.mts) exports remain available; `npm run demo` runs those examples.

## Relationship to the application

[source-manifest.json](source-manifest.json) records the application snapshot, source paths and hashes, retained declarations, and published file hashes. The source application repository is private; the manifest gives maintainers a traceable comparison point, not a public attestation of every live result.

Runtime function bodies are retained after removing TypeScript and internal comments and redirecting imports. The standalone adaptations are explicit:

- PlanMatch's candidate and base-score wrappers accept prepared inputs; a supplied map replaces loading the shared-benefit catalog. See [PlanMatch extraction boundaries](planmatch/README.md#extraction-boundaries).
- The [pipeline runner](data-pipeline/process-dataset.mjs) connects the original transformations to local CSV input and JSON output. Its orchestration and CLI are new.
- [Telemetry](shared/telemetry.mjs) is a no-op: existing breadcrumb call sites send and store nothing.
- Shared calculations live once across the three modules. Literal null separators in the landscape source are escaped for readable source files without changing their value.

A source snapshot alone cannot reproduce a website result: inputs, data freshness, configuration, and the selected ranking path also matter. The module documentation identifies known missing-value behavior and assumptions so readers can examine them alongside the calculations.

## Changes and contributions

This repository starts with a clean history, without importing the application's history. Future releases retain their history so changes remain reviewable. See [CONTRIBUTING.md](CONTRIBUTING.md) for reporting issues and proposing changes.

The repository contains no member records, carrier agreements or payment schedules, credentials, infrastructure configuration, database queries, or production logs. MIT covers the code in this repository; it does not grant rights to third-party datasets or the Pocket Protector name and logo.
