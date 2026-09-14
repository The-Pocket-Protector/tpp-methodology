# Data pipeline examples

These functions show two data-processing steps from the application source at the version recorded in [the source manifest](../source-manifest.json). They are independent examples: the CSV parser's output is not the input to the drug-response normalizer.

| Function | Role | Example |
| --- | --- | --- |
| [`parseCsvLine`](formulary-csv.mjs) | Splits one CSV record into string fields, preserving quoted commas, escaped quotes, empty fields, and leading zeroes. Extracted from the formulary loader. | `"000123","sample, value",` becomes `['000123', 'sample, value', '']`. |
| [`normalizeDrugGenericFlag`](drug-normalization.mts) | Converts known generic/brand flag representations to `true` or `false`; unknown values become `null`. | `'generic'` becomes `true`; `'brand'` becomes `false`; `'unknown'` becomes `null`. |
| [`normalizeDrugSearchResponseV2` / `V3`](drug-normalization.mts) | Normalizes drug lists for the API response. V3 also supplies defaults for missing drug metadata. | A missing sibling list becomes `[]`; missing ingredient metadata becomes `null`. |

Run the invented examples from the repository root:

```sh
npm run demo:pipeline
npm test
```

## Where these fit

The formulary loader reads a source file, parses each row, maps named fields, and writes batches. This folder exposes its row parser. The drug-response normalizer acts later, when the API prepares drug-search results for the website.

The full import process also includes source selection, download and validation, plan-year handling, storage, joins, and refresh operations. Those parts are not included here. Provider-directory fetching and matching are also outside this folder's scope.

## Input assumptions

The CSV function processes one line at a time; it is not a general multiline CSV parser and does not reject malformed quoting. Drug-response functions expect the application's upstream response shape and preserve extra fields. They are not validators or tools for removing sensitive data. The examples contain only invented inputs.

The original function logic is retained. The parser has an export added so it can be run independently. Database connections, credentials, operational paths, and internal comments are excluded.
