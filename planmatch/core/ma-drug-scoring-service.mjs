import { prescriptionComparisonExclusion } from './ma-drug-classification.mjs';
import { normalizeDrugDetails } from './drug-detail-contract.mjs';
import { formatDrugDisplayName } from './drug-display-format.mjs';
import { computeOffFormularyRetail } from './off-formulary-pricing.mjs';
import { buildGenericSuggestion } from './generic-substitution.mjs';
import { normalizeDrugDetail } from './drug-detail-contract.mjs';
import { maPlanIncludesPartD } from '../../data-pipeline/core/recommendation-adapters.mjs';
export const roundCents = (n) => Math.round(n * 100) / 100;
export const UNKNOWN_COST_SHARE = Object.freeze({
    cost_type: null,
    cost_amt: null,
    fills_priced: null,
    full_price_per_fill: null,
    ira_cap_reached: null,
    prior_auth: null,
    step_therapy: null,
    quantity_limit: null,
    ql_amount: null,
    ql_days: null,
});
export function priceUncoveredDrugs(uncoveredDrugObjs, offFormularyPriceMap, nadacFeedStale, planSubstitutions) {
    const details = [];
    const substitutedNames = [];
    let retailTotal = 0;
    let unpricedCount = 0;
    let substitutedCost = 0;
    for (const d of uncoveredDrugObjs) {
        const priceInfo = (d.rxcui ? offFormularyPriceMap?.[String(d.rxcui)] : null) || null;
        let estRetail = null;
        let retailSource = null;
        if (priceInfo) {
            const isNinety = String(d.frequency) === '90';
            const r = computeOffFormularyRetail({
                unitPrice: priceInfo.unitPrice,
                priceSource: priceInfo.priceSource,
                quantity: d.quantity || 30,
                daysSupply: isNinety ? 90 : 30,
                fillsPerYear: isNinety ? 4 : 12,
                isGeneric: priceInfo.isGeneric,
                tty: priceInfo.tty,
                feedStale: nadacFeedStale,
            });
            estRetail = r.annualRetail;
            retailSource = r.costDataSource;
        }
        const sub = d.rxcui ? planSubstitutions?.[String(d.rxcui)] : undefined;
        const substitutes = Boolean(sub) && (estRetail == null || sub.annualOop < estRetail);
        if (substitutes && sub) {
            substitutedCost += sub.annualOop;
            substitutedNames.push(String(d.name ?? ''));
            const { suggestion } = buildGenericSuggestion({
                genericRxcui: sub.genericRxcui,
                genericName: sub.genericName,
                strength: sub.strength,
                genericTier: sub.tier,
                genericCoveredOnPlan: true,
                genericAnnualOop: sub.annualOop,
                brandAnnualRetail: estRetail,
                brandName: d.name == null ? null : String(d.name),
            });
            const record = normalizeDrugDetail({
                name: d.name,
                rxcui: d.rxcui ? String(d.rxcui) : null,
                tier: sub.tier,
                covered: true,
                yearly: sub.annualOop,
                cost_data_source: 'generic_substitution',
                priced_as_generic: true,
                generic_suggestion: suggestion,
                deductible_applies: sub.deductibleApplies,
                ...(sub.costShare ?? UNKNOWN_COST_SHARE),
            });
            if (record)
                details.push(record);
            continue;
        }
        if (estRetail != null)
            retailTotal += estRetail;
        else
            unpricedCount++;
        const record = normalizeDrugDetail({
            name: d.name,
            rxcui: d.rxcui ? String(d.rxcui) : null,
            tier: null,
            covered: false,
            estimated_annual_retail: estRetail,
            cost_data_source: retailSource,
            ...UNKNOWN_COST_SHARE,
            fills_priced: estRetail != null ? (String(d.frequency) === '90' ? 4 : 12) : null,
        });
        if (record)
            details.push(record);
    }
    return {
        details,
        retailTotal: roundCents(retailTotal),
        unpricedCount,
        substitutedNames,
        substitutedCost: roundCents(substitutedCost),
    };
}
export function scoreDrugCoverage({ planKey, hasPartD, drugLookup, specialtyDrugsByPlan, normalizedDrugs, totalDrugs, offFormularyPriceMap, nadacFeedStale = false, genericSubstitutionMap, drugClassifications = {}, }) {
    let drugScore = 50;
    let estAnnualDrugCost = null;
    let estAnnualDrugCostEstimable = true;
    let unestimatedDrugCount = 0;
    let drugsCovered = 0;
    let drugsDetails = [];
    let uncoveredDrugs = [];
    let uncoveredDrugObjs = [];
    let specialtyTierDrugs = [];
    let hasDedDrugs = false;
    const allRequestedDrugs = normalizedDrugs?.items || [];
    const requestedDrugs = allRequestedDrugs.filter((d) => !prescriptionComparisonExclusion(drugClassifications[String(d.rxcui ?? '').trim()]));
    if (totalDrugs > 0) {
        const dl = drugLookup[planKey];
        if (dl) {
            drugsCovered = dl.covered;
            estAnnualDrugCost = dl.annual_cost;
            estAnnualDrugCostEstimable = dl.annual_cost_estimable;
            unestimatedDrugCount = dl.unestimated_drug_count;
            hasDedDrugs = dl.hasDeductibleDrugs;
            drugsDetails = normalizeDrugDetails(dl.drugs);
            specialtyTierDrugs = specialtyDrugsByPlan[planKey] || [];
            const coveredNames = new Set(drugsDetails.map(d => String(d.name || '').toLowerCase()));
            uncoveredDrugObjs = requestedDrugs
                .filter(d => d.name && !coveredNames.has(String(d.name).toLowerCase().trim()));
            const coveragePct = Math.min(dl.covered / totalDrugs, 1);
            const coveragePoints = coveragePct * 20;
            const yearlyCost = dl.annual_cost || 0;
            const costPoints = dl.annual_cost_estimable
                ? Math.max(0, 10 - (yearlyCost / 500) * 10)
                : 5;
            const rawScore = coveragePoints + costPoints;
            drugScore = Math.round((rawScore / 30) * 100);
            if (specialtyTierDrugs.length > 0) {
                drugScore = Math.max(drugScore - (specialtyTierDrugs.length * 5), 10);
            }
        }
        else {
            drugScore = 10;
            uncoveredDrugObjs = requestedDrugs.filter(d => d.name);
        }
        uncoveredDrugs = uncoveredDrugObjs.map(d => formatDrugDisplayName(d.name));
    }
    const offFormularyPlanFields = {};
    if (offFormularyPriceMap && typeof offFormularyPriceMap === 'object' && uncoveredDrugObjs.length > 0) {
        const { details, retailTotal, unpricedCount, substitutedNames, substitutedCost } = priceUncoveredDrugs(uncoveredDrugObjs, offFormularyPriceMap, nadacFeedStale, genericSubstitutionMap ? genericSubstitutionMap[planKey] : null);
        drugsDetails = [...drugsDetails, ...details];
        if (substitutedNames.length > 0) {
            const substituted = new Set(substitutedNames.map((n) => String(n).toLowerCase().trim()));
            uncoveredDrugs = uncoveredDrugObjs
                .filter((d) => !substituted.has(String(d.name ?? '').toLowerCase().trim()))
                .map((d) => formatDrugDisplayName(d.name));
            drugsCovered += substitutedNames.length;
            estAnnualDrugCost = roundCents((estAnnualDrugCost ?? 0) + substitutedCost);
            offFormularyPlanFields.off_formulary_substituted_count = substitutedNames.length;
        }
        const coveredCost = (typeof estAnnualDrugCost === 'number') ? estAnnualDrugCost : null;
        offFormularyPlanFields.estimated_annual_off_formulary_retail = retailTotal;
        offFormularyPlanFields.estimated_annual_total_drug_cost = (coveredCost == null && retailTotal === 0)
            ? null
            : roundCents((coveredCost || 0) + retailTotal);
        if (unpricedCount > 0)
            offFormularyPlanFields.off_formulary_unpriced_count = unpricedCount;
    }
    if (totalDrugs > 0 && !maPlanIncludesPartD(hasPartD)) {
        drugScore = Math.min(drugScore, 5);
        if (!drugsDetails.length)
            estAnnualDrugCost = null;
    }
    for (const d of allRequestedDrugs) {
        const exclusion = prescriptionComparisonExclusion(drugClassifications[String(d.rxcui ?? '').trim()]);
        if (!exclusion)
            continue;
        const detail = normalizeDrugDetail({
            name: d.name, rxcui: d.rxcui, covered: false, tier: null,
            prescription_comparison_exclusion: exclusion,
            yearly: null, estimated_annual_retail: null, cost_data_source: null,
            ...UNKNOWN_COST_SHARE,
        });
        if (detail)
            drugsDetails.push(detail);
    }
    return {
        drugScore,
        estAnnualDrugCost,
        estAnnualDrugCostEstimable,
        unestimatedDrugCount,
        drugsCovered,
        drugsDetails,
        uncoveredDrugs,
        specialtyTierDrugs,
        hasDedDrugs,
        offFormularyPlanFields,
    };
}
