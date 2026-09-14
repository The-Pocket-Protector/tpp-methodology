import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterCandidatePlans, classifyDsnpEligibility, decodeSnpConditionRow,
  normalizeRecommendPriorities, calculateBaseScore, selectCareMatchTier,
  filterPlansForProviderNetworkPolicy, runProposedRanking, scorePlanProposed,
  proposedRankingMode, attachProposedScoring, scoreDrugCoverage, buildProviderFacts,
  scorePharmacyNetwork, scoreSupplementalBenefits, supplySharedPool,
  rankMaRecommendationsByUserPreferences,
} from '../planmatch/index.mjs';
import { exampleSettings, exampleInputs, preparedPlan, rankedInput } from '../examples/planmatch-fixtures.mjs';

Object.assign(process.env, exampleSettings);
const run = (recommendations, overrides = {}) => runProposedRanking({ recommendations, currentPlan: null, currentPlanSavings: null, inputs: exampleInputs, ...overrides });

test('candidate filtering respects Part D, SNP admission, and current-plan exceptions', () => {
  const plans = [preparedPlan('regular'), preparedPlan('dual', { snp_type: 'D-SNP' }), preparedPlan('institutional', { snp_type: 'I-SNP' }), preparedPlan('no-rx', { part_d_coverage: 'No' })];
  assert.deepEqual(filterCandidatePlans({ adaptedPlans: plans }).plans.map(p => p.contract_id), ['sample-regular']);
  assert.deepEqual(filterCandidatePlans({ adaptedPlans: plans, offer_rx: false }).plans.map(p => p.contract_id), ['sample-no-rx']);
  const withCurrent = filterCandidatePlans({ adaptedPlans: plans, current_plan: { contract_id: 'sample-dual', plan_id: '001' } });
  assert.ok(withCurrent.plans.some(p => p.contract_id === 'sample-dual'));
});

test('C-SNP eligibility uses the filed condition, with explicit unknown lookup behavior', () => {
  const plans = [preparedPlan('diabetes', { snp_type: 'C-SNP' }), preparedPlan('lung', { snp_type: 'C-SNP' })];
  const options = { adaptedPlans: plans, body: { csnpConditions: ['Diabetes'], csnp_condition_keys: ['diabetes'] }, filedByPlan: new Map([
    ['sample-diabetes|001|0', decodeSnpConditionRow({ cond_diabetes: true })],
    ['sample-lung|001|0', decodeSnpConditionRow({ cond_lung: true })],
  ]) };
  assert.deepEqual(filterCandidatePlans(options).plans.map(p => p.contract_id), ['sample-diabetes']);
  const unresolved = filterCandidatePlans({ ...options, csnpLookupFailed: true });
  assert.equal(unresolved.plans.length, 2);
  assert.ok(unresolved.plans.every(p => p.csnp_match === null));
  assert.equal(unresolved.csnpAdmission.lookup_failed, true);
});

test('partial Medicaid assistance excludes a full-benefit-only plan except current coverage', () => {
  const input = { profile: { assistance: 'yes', full_benefits: 'no', cost_sharing_covered: 'no' }, partialDual: false, sourceReportMonth: 'sample-month', isCurrentPlan: false };
  assert.equal(classifyDsnpEligibility(input).keep, false);
  assert.equal(classifyDsnpEligibility({ ...input, isCurrentPlan: true }).eligibility.status, 'current_plan_exempt');
});

test('candidate deduplication retains the lower-premium row for the same plan', () => {
  const result = filterCandidatePlans({ adaptedPlans: [preparedPlan('duplicate', { consolidated_premium: '80' }), preparedPlan('duplicate', { consolidated_premium: '30' })] });
  assert.equal(result.plans.length, 1);
  assert.equal(result.plans[0].consolidated_premium, '30');
  assert.equal(result.dedupedCount, 1);
});

test('user preference inputs change the normalized weights', () => {
  const plain = normalizeRecommendPriorities({}).weights;
  const premium = normalizeRecommendPriorities({ priorities: ['low-premium'] }).weights;
  assert.ok(premium.premium > plain.premium);
  assert.ok(Math.abs(Object.values(premium).reduce((a,b) => a+b, 0) - 100) < 1e-10);
});

test('base formula combines the premium signal with original star and Part D bonuses', () => {
  const score = calculateBaseScore({ premium: 0, moop: 5000, minPremium: 0, maxPremium: 100, minMoop: 0, maxMoop: 10000, weights: { premium: 100, out_of_pocket: 0, benefits: 0, pharmacy_network: 0 }, benefitsScore: 0, pharmacyScore: 0, providerBonus: 0, hasPartD: 'yes', p: { star_rating_overall: '4' } });
  assert.equal(score.premiumScore, 100);
  assert.equal(score.overall, 106);
});

test('confirmed doctor coverage outranks a cheaper plan supported only by a listing', () => {
  const result = run([rankedInput('listed', 100, { doctors_in_network: 0, doctors_likely_in_network: 1 }), rankedInput('confirmed', 1200)]);
  assert.deepEqual(result.rankOrder, [1, 0]);
});

test('missing cost information remains unscoreable within the same coverage group', () => {
  const result = run([rankedInput('unknown', 0, { annual_cost_estimable: false }), rankedInput('known', 1200)]);
  assert.equal(result.blocks[0].adjusted_annual_cost, null);
  assert.deepEqual(result.rankOrder, [1, 0]);
});

test('adjusted cost includes the documented visit and risk components', () => {
  const result = scorePlanProposed(preparedPlan('cost'), { net_plan_annual_cost_after_giveback: 1200 }, exampleInputs);
  assert.equal(result.components.visits_total, 130);
  assert.equal(result.components.risk_term, 750);
  assert.equal(result.adjusted_annual_cost, 2080);
});

test('quality rules can change the default pick without removing the cheaper displayed plan', () => {
  const result = run([rankedInput('low-star', 100, { star_rating: 2 }), rankedInput('eligible', 1200)]);
  assert.deepEqual(result.rankOrder, [0, 1]);
  assert.equal(result.winnerIndex, 1);
  assert.equal(result.qualityFloor.applied, true);
});

test('equal coverage uses the original 120-dollar model-difference threshold', () => {
  const current = rankedInput('current', 1200);
  const options = { currentPlan: current.plan, currentPlanSavings: current.savings };
  assert.equal(run([rankedInput('119-less', 1081)], options).verdict, 'stay');
  assert.equal(run([rankedInput('120-less', 1080)], options).verdict, 'switch');
});

test('a confirmed current-plan coverage loss can trigger switching below the cost threshold', () => {
  const current = rankedInput('current', 1200, { doctors_in_network: 0, provider_details: [{ status: 'out_of_network' }] });
  const result = run([rankedInput('covers-doctor', 1200)], { currentPlan: current.plan, currentPlanSavings: current.savings });
  assert.equal(result.verdict, 'switch');
  assert.equal(result.trigger, 'coverage');
});

test('strict provider policy requires every selected doctor to be accounted for', () => {
  const result = filterPlansForProviderNetworkPolicy([preparedPlan('known'), preparedPlan('unknown', { doctors_in_network: 0, doctor_requirements_unknown: 1 })], { policy: 'strict_all_in_network', selectedDoctorCount: 1 });
  assert.equal(result.filteredPlans.length, 1);
  const tier = selectCareMatchTier([preparedPlan('partial', { drugs_covered: 0 }), preparedPlan('complete')], 1, 1);
  assert.equal(tier.plans.length, 1);
});

test('provider and pharmacy functions evaluate supplied evidence', () => {
  const facts = buildProviderFacts({ planKey: 'sample', totalDoctors: 2, providerScores: new Map([['sample', { provider_score: 80, details: [{ status: 'in_network' }, { status: 'likely_in_network' }] }]]) });
  assert.equal(facts.doctorsInNetwork, 1);
  assert.equal(facts.doctorsLikelyInNetwork, 1);
  const pharmacy = scorePharmacyNetwork({ planKey: 'sample', pharmacyInput: { zip: '00000' }, pharmPref: 'retail', pharmacyNetworkMap: new Map([['sample', { preferred_retail: true }]]) });
  assert.equal(pharmacy.pharmacyScore, 100);
});

test('drug scoring preserves unknown pricing when a medication cannot be matched', () => {
  const result = scoreDrugCoverage({ planKey: 'sample', hasPartD: 'yes', drugLookup: {}, specialtyDrugsByPlan: {}, normalizedDrugs: { items: [{ name: 'Example medicine', rxcui: 'sample-drug' }] }, totalDrugs: 1 });
  assert.equal(result.drugsCovered, 0);
  assert.equal(result.estAnnualDrugCost, null);
  assert.equal(result.uncoveredDrugs.length, 1);
});

test('benefit scoring accepts explicit synthetic lookup maps', () => {
  supplySharedPool(new Map());
  const result = scoreSupplementalBenefits({ plan: { contract_id: 'sample', plan_id: '001' }, benefitDetailsMap: new Map(), dentalBenefitsMap: new Map(), vbidMap: new Map(), requestedBenefits: [] });
  assert.ok(Number.isFinite(result.benefitsScore));
});

test('preference ranking enforces the network-freedom filter', () => {
  const results = rankMaRecommendationsByUserPreferences([preparedPlan('hmo'), preparedPlan('ppo', { plan_type: 'PPO' })], { network_freedom_required: true });
  assert.equal(results.length, 1);
  assert.equal(results[0].plan_type, 'PPO');
});

test('off, shadow, and rank modes have distinct attachment behavior', () => {
  assert.equal(proposedRankingMode({}), 'off');
  for (const mode of ['off', 'shadow', 'rank']) {
    const rows = [rankedInput('expensive', 2000), rankedInput('cheaper', 1000)];
    const payload = { recommendations: rows.map(row => ({ ...row.plan, recommendation_basis: { savings_components: row.savings } })) };
    attachProposedScoring({ payload, ...exampleInputs, mode, givebackMode: 'off' });
    if (mode === 'off') assert.equal(payload.proposed_ranking, undefined);
    else {
      assert.equal(payload.proposed_ranking.mode, mode);
      assert.equal(payload.recommendations[0].contract_id, mode === 'rank' ? 'sample-cheaper' : 'sample-expensive');
    }
  }
});
