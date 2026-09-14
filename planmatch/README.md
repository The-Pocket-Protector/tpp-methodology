# PlanMatch decision rules

This folder contains the Medicare Advantage PlanMatch core: candidate admission, doctor and drug evaluation, benefit and pharmacy scoring, the weighted base score, preference ranking, care filtering, and cost-based ranking with a stay-or-switch verdict.

The code is extracted from the application source version recorded in [source-manifest.json](../source-manifest.json). It retains the runtime function logic. TypeScript annotations and internal comments are removed so these JavaScript modules run directly in Node without installing packages. The two extracted calculation blocks and the catalog-input adapter are described below.

Start with [the runnable example](../examples/planmatch.mjs) or import functions from [index.mjs](index.mjs):

```sh
npm run demo:planmatch
npm test
```

The sample plans, coverage facts, prices, and settings are invented. The example demonstrates eligibility and final ranking with prepared inputs; it also shows the base-score calculation as a separate stage. It is not a live plan search or a quote.

## What determines a result

| Stage | Read the code | Role |
| --- | --- | --- |
| Candidate admission | [candidate-eligibility](core/candidate-eligibility.mjs), [C-SNP matching](core/csnp-condition-match.mjs) | Applies plan-type and Part D choices, D-SNP/C-SNP/I-SNP rules, current-plan exceptions, and deduplication to an already-selected geographic pool. |
| Member preferences | [preference-inputs](core/preference-inputs.mjs) | Translates the member's choices into weights; original configurable defaults are retained. |
| Doctor and drug evidence | [provider facts](core/ma-provider-facts-service.mjs), [drug scoring](core/ma-drug-scoring-service.mjs) | Evaluates supplied network/formulary lookup results, preserving distinctions between confirmed, listed, and unknown evidence. Includes off-formulary price and generic-substitution calculations. |
| Benefits and pharmacy | [benefit scoring](core/ma-benefit-scoring-service.mjs), [pharmacy scoring](core/ma-pharmacy-scoring-service.mjs) | Scores prepared dental, vision, hearing, other benefit, and pharmacy data using the original supporting formulas. |
| Base score | [base-score](core/base-score.mjs) | Combines premium, out-of-pocket maximum, benefits, pharmacy, and the original bonus terms. This score is one stage of the process. |
| Preference order and care filters | [preference-ranking](core/preference-ranking.mjs), [care-coverage](core/care-coverage.mjs), [provider policy](core/provider-network-policy.mjs) | Applies member priorities, network-freedom filtering, strict provider policy when selected, and care-match tiers. |
| Cost ranking and verdict | [ranking](core/ranking.mjs), [veteran giveback ranking](core/ma-giveback-ranking.mjs) | Computes model cost components, orders plans, selects the default pick, and compares that pick with current coverage. |

The cost-ranking module retains scoring model version 18 from this snapshot. Its ordering considers confirmed doctors, overall care coverage, and model cost; it has additional tie-breakers and an optional veteran giveback rule. Quality, language-targeting, and preventive-vision rules can change the default pick while retaining plans in the displayed ordering. Missing required cost components remain unscoreable in this stage.

The stay-or-switch verdict considers confirmed care losses and a 120-dollar annual difference in the model's score. That score includes a utilization-weighted risk term and benefit assumptions; it is not a forecast or quote of the member's actual bill. Read the component output and the code together.

## Ranking modes and configuration

The application contains multiple paths. `MA_PROPOSED_RANKING` selects `off`, `shadow`, or `rank`: off leaves the prior path in place, shadow attaches calculations without changing the served order, and rank also reorders the results. `MA_GIVEBACK_RANKING` separately controls the veteran giveback adjustment. Provider weighting, employer comparison, default weights, and score bonuses also have settings in the source.

The original configuration behavior is retained. [exampleSettings](../examples/planmatch-fixtures.mjs) specifies a reproducible demonstration configuration; it is **not a record of production settings**. `attachProposedScoring` also accepts an explicit `mode` and `givebackMode`. A public release needs an owner-confirmed source version and configuration before claiming to reproduce the website's served order.

## Extraction boundaries

- Most functions are direct runtime exports: their bodies match the source after removing TypeScript and comments and changing local import paths.
- `filterCandidatePlans` wraps the original normalization, in-memory filtering, and deduplication statements from `prepareMaCandidateContext`. It accepts the lookup results as maps, initializes the same C-SNP audit fields, and returns the plans and audit information. It preserves the original mutation of candidate rows to attach eligibility evidence.
- `calculateBaseScore` wraps the original numeric statements from `scoreMaPlans`. Benefit, pharmacy, and provider scores are supplied by the caller; the original helpers that produce them are included separately.
- `supplySharedPool` replaces loading the shared-benefit catalog from the filesystem with a caller-supplied `Map`. Call it before benefit scoring, using the same catalog shape as the source. The demonstration tests explicitly supply an empty map for invented plans. No live catalog or data loading is bundled; the lookup and benefit decision functions retain their source logic.

These boundaries are recorded per file in the manifest. The `core` directory retains the supporting functions because omitting them would hide part of the calculations.

## What is still outside this folder

The API, location/state licensing checks, database queries, live source datasets, doctor-directory retrieval/matching, covered-drug pricing lookup, data enrichment, final response limits, enrollment, and UI are not included. Callers must supply the facts those stages produce. Special-needs admission is represented by the source rules and supplied filing data; it is not an independent verification of a person's eligibility.

Some prior-path value helpers retain legacy missing-value fallbacks. The later cost-ranking stage explicitly rejects required unknown cost components. Publishing the source does not remove those differences or establish that every part of the product is correct or unaffected by compensation.
