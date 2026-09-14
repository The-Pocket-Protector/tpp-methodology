import { filterCandidatePlans, normalizeRecommendPriorities, calculateBaseScore, runProposedRanking, PROPOSED_SCORING_MODEL_VERSION } from '../planmatch/index.mjs';
import { exampleSettings, exampleInputs, rankedInput } from './planmatch-fixtures.mjs';

// Explicit demonstration settings, not a record of production configuration.
Object.assign(process.env, exampleSettings);
const candidates = [
  rankedInput('care-match', 1200),
  rankedInput('cheaper-missing-doctor', 400, { doctors_in_network: 0 }),
  rankedInput('missing-cost', 800, { annual_cost_estimable: false }),
  rankedInput('dual-only', 200, { snp_type: 'D-SNP' }),
];
const eligible = filterCandidatePlans({ adaptedPlans: candidates.map(row => row.plan), hasMedicaid: false });
const allowed = new Set(eligible.plans.map(plan => plan.contract_id));
const comparisons = candidates.filter(row => allowed.has(row.plan.contract_id));
const priority = normalizeRecommendPriorities({ priorities: ['low-premium'] });

// This demonstrates the base formula separately. Final cost ranking below
// takes prepared coverage and cost records, as the application does.
const base = calculateBaseScore({
  premium: 50, moop: 5000, minPremium: 0, maxPremium: 100, minMoop: 0, maxMoop: 10000,
  weights: priority.weights, benefitsScore: 50, pharmacyScore: 100, providerBonus: 0,
  hasPartD: 'yes', p: { star_rating_overall: '4' },
});
const current = rankedInput('current', 1500);
const result = runProposedRanking({ recommendations: comparisons, currentPlan: current.plan, currentPlanSavings: current.savings, inputs: exampleInputs });
console.log(`Synthetic PlanMatch example — scoring model ${PROPOSED_SCORING_MODEL_VERSION}`);
console.log('Eligible candidates:', eligible.plans.map(plan => plan.plan_name));
console.log('Example normalized preferences:', priority.weights);
console.log('Example base score (separate scoring stage):', base.overall);
console.table(result.rankOrder.map(index => ({
  plan: comparisons[index].plan.plan_name,
  confirmedDoctors: comparisons[index].plan.doctors_in_network,
  coveredDrugs: result.blocks[index].coverage.drugs,
  adjustedCostScore: result.blocks[index].adjusted_annual_cost,
})));
console.log('Current-plan comparison:', { verdict: result.verdict, trigger: result.trigger, modelCostDifference: result.margin_vs_current });
console.log('The adjusted score includes a risk term; it is not a quoted healthcare bill.');
