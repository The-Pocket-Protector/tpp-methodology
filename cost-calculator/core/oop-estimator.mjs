import * as Sentry from '../../shared/telemetry.mjs';
import { getMedicareConstantsStrict } from './medicare-constants.mjs';
export const COST_TYPE_COPAY = 1;
export const COST_TYPE_COINSURANCE = 2;
export const BEN_COST_COLUMNS = Object.freeze({
    retail_preferred: { type: 'COST_TYPE_PREF', amt: 'COST_AMT_PREF' },
    retail_standard: { type: 'COST_TYPE_NONPREF', amt: 'COST_AMT_NONPREF' },
    mail_preferred: { type: 'COST_TYPE_MAIL_PREF', amt: 'COST_AMT_MAIL_PREF' },
    mail_standard: { type: 'COST_TYPE_MAIL_NONPREF', amt: 'COST_AMT_MAIL_NONPREF' },
});
export const DEFAULT_CASCADE = Object.freeze([
    'mail_preferred',
    'mail_standard',
    'retail_preferred',
    'retail_standard',
]);
export function isMailCombo(fallback) {
    return fallback === 'mail_preferred' || fallback === 'mail_standard';
}
export const DEFAULT_FILLS_BY_DAYS_SUPPLY = Object.freeze({ 30: 12, 60: 6, 90: 4 });
export function parseCostType(raw) {
    if (raw == null)
        return 0;
    if (raw === 'Copay')
        return COST_TYPE_COPAY;
    if (raw === 'Coinsurance')
        return COST_TYPE_COINSURANCE;
    const n = parseInt(String(raw), 10);
    return Number.isFinite(n) ? n : 0;
}
export function unestimable(reason, source = 'no_data') {
    return {
        oop: null, estimable: false, fallback: reason, costDataSource: source, iraCapReached: false,
        costType: null, costAmt: null, fillsPriced: null, fullPricePerFill: null,
    };
}
export function costTypeLabel(costType) {
    if (costType === COST_TYPE_COPAY)
        return 'copay';
    if (costType === COST_TYPE_COINSURANCE)
        return 'coinsurance';
    return null;
}
export function resolveFillsPerYear(input) {
    if (Number.isFinite(input.fillsPerYear) && input.fillsPerYear > 0)
        return input.fillsPerYear;
    const days = parseInt(String(input.daysSupply), 10);
    return DEFAULT_FILLS_BY_DAYS_SUPPLY[days] || 12;
}
export function resolveCascade(input, benCostRow) {
    const order = (Array.isArray(input.pharmacyCascade) && input.pharmacyCascade.length > 0)
        ? input.pharmacyCascade
        : DEFAULT_CASCADE;
    for (const combo of order) {
        const cols = BEN_COST_COLUMNS[combo];
        if (!cols)
            continue;
        const rawType = benCostRow[cols.type];
        const rawAmt = benCostRow[cols.amt];
        if (rawType == null || rawAmt == null)
            continue;
        const costType = parseCostType(rawType);
        if (!costType)
            continue;
        const costAmt = parseFloat(String(rawAmt));
        if (!Number.isFinite(costAmt))
            continue;
        return { combo, costType, costAmt };
    }
    return null;
}
export function resolveCoverageFallback(coverageRow) {
    const prefType = parseCostType(coverageRow.cost_type_preferred);
    const nonprefType = parseCostType(coverageRow.cost_type_nonpreferred);
    const costType = prefType || nonprefType;
    if (!costType)
        return null;
    const costAmt = prefType > 0
        ? parseFloat(String(coverageRow.cost_amt_preferred ?? 0))
        : parseFloat(String(coverageRow.cost_amt_nonpreferred ?? 0));
    if (!Number.isFinite(costAmt))
        return null;
    return { combo: 'plan_drug_coverage', costType, costAmt };
}
export function roundCents(n) {
    return Math.round(n * 100) / 100;
}
export function computeDrugOOP(input) {
    try {
        Sentry.addBreadcrumb({ category: 'app', message: 'oop-estimator.computeDrugOOP started', level: 'info' });
    }
    catch (_bErr) {
    }
    try {
        const { benCostRow, coverageRow, nadacPrice, priceSource } = input;
        const quantity = input.quantity;
        if (!Number.isFinite(quantity) || quantity <= 0) {
            return unestimable('missing_quantity');
        }
        const fills = resolveFillsPerYear(input);
        const constants = getMedicareConstantsStrict(input.planYear);
        const partDOopCap = constants.part_d.annual_oop_cap;
        let resolved;
        let dedApplies;
        if (benCostRow) {
            resolved = resolveCascade(input, benCostRow);
            if (!resolved)
                return unestimable('no_cost_data');
            dedApplies = benCostRow.DED_APPLIES_YN === 'Y';
        }
        else if (coverageRow) {
            resolved = resolveCoverageFallback(coverageRow);
            if (!resolved)
                return unestimable('no_cost_data');
            dedApplies = coverageRow.ded_applies_yn !== 'N';
        }
        else {
            return unestimable('no_cost_data');
        }
        const { combo, costType, costAmt } = resolved;
        const fallback = combo;
        if (costType === COST_TYPE_COPAY && !dedApplies) {
            const oop = Math.min(costAmt * fills, partDOopCap);
            return {
                oop: roundCents(oop),
                estimable: true,
                fallback,
                costDataSource: 'beneficiary_costs_copay',
                iraCapReached: costAmt * fills >= partDOopCap,
                costType: 'copay',
                costAmt,
                fillsPriced: fills,
                fullPricePerFill: null,
            };
        }
        if (!Number.isFinite(nadacPrice) || nadacPrice <= 0) {
            return unestimable('no_nadac');
        }
        const drugPricePerFill = nadacPrice * quantity;
        const deductible = dedApplies ? (parseFloat(String(input.deductible)) || 0) : 0;
        if (dedApplies && (input.deductible == null || !Number.isFinite(parseFloat(String(input.deductible))))) {
            return unestimable('missing_deductible');
        }
        let oop;
        if (!dedApplies) {
            if (costType === COST_TYPE_COPAY) {
                oop = costAmt * fills;
            }
            else if (costType === COST_TYPE_COINSURANCE) {
                oop = drugPricePerFill * costAmt * fills;
            }
            else {
                return unestimable('unknown_cost_type');
            }
        }
        else if (costType === COST_TYPE_COPAY) {
            const fillsInDed = Math.min(Math.floor(deductible / drugPricePerFill), fills);
            const remainingDed = deductible - (fillsInDed * drugPricePerFill);
            const hasStraddle = remainingDed > 0 && (fillsInDed < fills);
            oop = fillsInDed * drugPricePerFill;
            if (hasStraddle) {
                oop += remainingDed + costAmt;
                oop += (fills - fillsInDed - 1) * costAmt;
            }
            else {
                oop += (fills - fillsInDed) * costAmt;
            }
        }
        else if (costType === COST_TYPE_COINSURANCE) {
            const rate = costAmt;
            const fillsInDed = Math.min(Math.floor(deductible / drugPricePerFill), fills);
            const remainingDed = deductible - (fillsInDed * drugPricePerFill);
            const hasStraddle = remainingDed > 0 && (fillsInDed < fills);
            oop = fillsInDed * drugPricePerFill;
            if (hasStraddle) {
                const nonDedPortion = drugPricePerFill - remainingDed;
                oop += remainingDed + (nonDedPortion * rate);
                oop += (fills - fillsInDed - 1) * drugPricePerFill * rate;
            }
            else {
                oop += (fills - fillsInDed) * drugPricePerFill * rate;
            }
        }
        else {
            return unestimable('unknown_cost_type');
        }
        const cappedOop = Math.min(oop, partDOopCap);
        const dataSource = benCostRow
            ? (priceSource || 'nadac')
            : 'plan_drug_coverage';
        return {
            oop: roundCents(cappedOop),
            estimable: true,
            fallback,
            costDataSource: dataSource,
            iraCapReached: oop >= partDOopCap,
            costType: costTypeLabel(costType),
            costAmt,
            fillsPriced: fills,
            fullPricePerFill: roundCents(drugPricePerFill),
        };
    }
    catch (err) {
        try {
            Sentry.addBreadcrumb({ category: 'app', message: 'oop-estimator.computeDrugOOP failed', level: 'error' });
        }
        catch (_bErr) {
        }
        throw err;
    }
}
export function aggregatePlanDrugOOP(planId, drugResults) {
    try {
        Sentry.addBreadcrumb({ category: 'app', message: 'oop-estimator.aggregatePlanDrugOOP started', level: 'info' });
    }
    catch (_bErr) {
    }
    try {
        const constants = getMedicareConstantsStrict();
        const partDOopCap = constants.part_d.annual_oop_cap;
        let sum = 0;
        let anyEstimable = false;
        let unestimatedDrugCount = 0;
        for (const r of drugResults) {
            if (r && r.estimable && Number.isFinite(r.oop)) {
                sum += r.oop;
                anyEstimable = true;
            }
            else {
                unestimatedDrugCount++;
            }
        }
        const annualCost = anyEstimable ? roundCents(Math.min(sum, partDOopCap)) : null;
        const annualCostEstimable = unestimatedDrugCount === 0 && drugResults.length > 0;
        return { annualCost, annualCostEstimable, unestimatedDrugCount };
    }
    catch (err) {
        try {
            Sentry.addBreadcrumb({ category: 'app', message: 'oop-estimator.aggregatePlanDrugOOP failed', level: 'error' });
        }
        catch (_bErr) {
        }
        throw err;
    }
}
