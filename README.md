# The Pocket Protector Methodology

A collection of PlanMatch decision rules and data-processing functions extracted from The Pocket Protector's JavaScript and TypeScript source. Each example has a stated scope, synthetic inputs, and tests you can inspect.

This is a private draft for review. It includes PlanMatch's core decision rules and their supporting calculations. It does not include the complete application or live data services, and it does not establish the website's deployed configuration.

## What you can inspect

| Module | What it does | What it does not do |
| --- | --- | --- |
| [PlanMatch algorithm](planmatch/) | Includes candidate eligibility rules, doctor/drug evaluation, benefit and pharmacy scoring, base and preference ranking, care filtering, and the cost-ranking/stay-or-switch model. | Fetch live data, run the complete API, or independently reproduce a website result without its data and configuration. |
| [Data pipeline](data-pipeline/) | Parses individual formulary CSV rows and normalizes drug-search responses, including generic/brand flags and missing metadata. | Download source files, import a database, join plan/formulary/provider datasets, or reproduce the complete ingestion process. |
| [Pharmacy ranking](src/pharmacy-ranking.mts) | Orders already-prepared plans by pharmacy data availability, doctor coverage, covered drug count, then estimated annual cost. | Retrieve plan data, verify a provider network, calculate drug prices, or reproduce the separate Medicare Advantage recommendation flow. |
| [Preference weights](src/preference-weights.mts) | Normalizes four non-care preference weights; uses the source defaults when inputs total zero. | Set the final ranking on its own; care coverage and other ranking decisions happen elsewhere. |
| [Premium values](src/premium-values.mts) | Reads monthly plan premiums and Part B giveback values, and subtracts giveback from the plan premium. | Calculate a member's complete cost of coverage, including Part B premiums, drug costs, medical care, eligibility, or enrollment timing. |

A Part B giveback is a benefit for the member. It is not a payment to the broker. A negative result from the premium helper is an arithmetic result, not a promise that all insurance costs are negative or that a member will receive that amount in cash.

## Try the examples

Use Node.js 22.18 or newer. No Python, package installation, credentials, or database are needed.

```sh
npm run demo
npm run demo:pipeline
npm run demo:planmatch
npm test
```

The sample plans, drug rows, identifiers, and amounts are invented. They are not quotes, recommendations, or real member records. The tests cover CSV quoting and identifier preservation, drug normalization, meaningful ordering, missing-cost handling, stable ties, non-mutation, and the selected premium and weighting functions.

## Why publishing functions helps

You can inspect the inputs the functions read, run the examples, and challenge the assumptions. These functions do not read broker compensation fields. That narrow observation does not prove that every upstream data choice, filtering step, configuration, or live recommendation is unaffected by compensation. A text scan for words such as “commission” would not establish that either.

## Relationship to the website

[source-manifest.json](source-manifest.json) records the source version, file hashes, extracted declarations, and adapters. Function logic is retained; unrelated declarations and internal comments are excluded. PlanMatch's TypeScript annotations are removed to produce runnable JavaScript. Its candidate/base-score wrappers and catalog input are documented in the [extraction boundaries](planmatch/README.md#extraction-boundaries). The pharmacy types are copied from the shared contract into local aliases so this package has no private imports.

Before a website page describes these functions as the code behind its results, the source owner must verify the deployed version and the complete calculation path. The website should link to the specific release and describe the published scope accurately.

For later updates, compare against the current source, review functional differences, update the manifest and examples, and publish a new version with a short change note. Keep the new public history: readers should be able to see how the methodology changes.

## What is excluded

This draft contains no member data, carrier agreements or payment schedules, database queries, credentials, infrastructure configuration, enrollment routes, or production logs. It does not copy the history of the application or the former public repository.

## License

No open-source license has been granted in this private draft. Select and approve a license before public release. The previous public repository uses MIT; using MIT again is an option for the owner to approve. Public code without an appropriate license should not be promoted as reusable open source.
