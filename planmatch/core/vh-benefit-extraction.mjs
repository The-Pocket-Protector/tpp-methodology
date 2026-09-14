import { findFirstAmount } from './ma-benefits.mjs';
import { rec } from './ma-benefits.mjs';
import { hasMeaningfulCoverage } from './ma-benefits.mjs';
export const PER_ITEM_EYEWEAR_CODES = ['17b1', '17b2', '17b3', '17b4', '17b5'];
export const HEARING_BENEFIT_MODELS = new Set([
    'copay_tier', 'allowance', 'allowance+copay_tier', 'vendor_program', 'unspecified',
]);
export function toNumber(value) {
    if (value === null || value === undefined || value === '')
        return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}
export function copayAmount(component) {
    const copay = rec(component);
    if (!copay || !['1', '3'].includes(String(copay.bdCopaymentAmountYesNoMinMax ?? '')))
        return null;
    return toNumber(copay.bdCopaymentMaxAmount ?? copay.bdCopaymentAmount ?? copay.bdCopaymentMinAmount);
}
export function coinsurancePct(component) {
    const coins = rec(component);
    if (!coins || !['1', '3'].includes(String(coins.bdCoinsurancePercentYesNoMinMax ?? '')))
        return null;
    return toNumber(coins.bdCoinsuranceMaxPercent ?? coins.bdCoinsurancePercent ?? coins.bdCoinsuranceMinPercent);
}
export function serviceRowCopay(benefitDetails, codes) {
    let explicitNo = false;
    let coinsuranceFiled = false;
    for (const categoryCode of codes) {
        const items = benefitDetails?.get(categoryCode);
        if (!Array.isArray(items))
            continue;
        for (const item of items) {
            const row = rec(item);
            const amount = copayAmount(row?.CopaymentComponent);
            if (amount !== null)
                return amount;
            if (String(rec(row?.CopaymentComponent)?.bdCopaymentAmountYesNoMinMax ?? '') === '2')
                explicitNo = true;
            if (coinsurancePct(row?.CoinsuranceComponent) !== null)
                coinsuranceFiled = true;
        }
    }
    return explicitNo && !coinsuranceFiled ? 0 : null;
}
export function serviceRowsPresent(benefitDetails, codes) {
    return codes.some((code) => {
        const items = benefitDetails?.get(code);
        return Array.isArray(items) && items.length > 0;
    });
}
export function examLaneCovered(benefitDetails, blockCode, serviceCodes) {
    return covered(benefitDetails, [blockCode, ...serviceCodes])
        && serviceRowsPresent(benefitDetails, serviceCodes);
}
export function examCoinsurance(benefitDetails, codes) {
    for (const categoryCode of codes) {
        const items = benefitDetails?.get(categoryCode);
        if (!Array.isArray(items))
            continue;
        for (const item of items) {
            const pct = coinsurancePct(rec(item)?.CoinsuranceComponent);
            if (pct !== null)
                return pct;
        }
    }
    return null;
}
export function covered(benefitDetails, codes) {
    return codes.some((code) => hasMeaningfulCoverage(benefitDetails?.get(code)));
}
export function extractVisionScoringInputs(benefitDetails, mirrorRow) {
    let combinedMax = null;
    const combined = findFirstAmount(benefitDetails?.get('17b'), [
        ['MaxPlancoverageAmountPeriodicityEyewearComponent', 'bdMaxPlanAmtPeriodMaxBenfitEyeCombinedMaxAmount'],
    ]);
    if (combined && combined.amount > 0) {
        const code = rec(combined.item.MaxPlancoverageAmountPeriodicityEyewearComponent)?.bdCoveragePeriodicity;
        combinedMax = { amount: combined.amount, periodicityCode: code == null ? null : String(code) };
    }
    const perItemMaxes = [];
    if (!combinedMax) {
        for (const categoryCode of PER_ITEM_EYEWEAR_CODES) {
            const found = findFirstAmount(benefitDetails?.get(categoryCode), [
                ['MaximumPlanBenefitCoverageComponent', 'bdMaxPlanBenefitCovAmt'],
            ]);
            if (!found || found.amount <= 0)
                continue;
            const code = rec(found.item.MaximumPlanBenefitCoverageComponent)?.bdMaxPlanBenefitCovPeriodicity;
            perItemMaxes.push({ amount: found.amount, periodicityCode: code == null ? null : String(code) });
        }
    }
    const bool = (column) => mirrorRow?.[column] === true;
    return {
        examCovered: examLaneCovered(benefitDetails, '17a', ['17a1', '17a2']),
        examCopay: serviceRowCopay(benefitDetails, ['17a1', '17a2']),
        examCoinsurancePct: examCoinsurance(benefitDetails, ['17a1', '17a2']),
        eyewearCovered: covered(benefitDetails, ['17b']) || combinedMax !== null || perItemMaxes.length > 0,
        combinedMax,
        perItemMaxes,
        richness: {
            lensMenu: bool('vision_eoc_lens_menu'),
            progressivesAtZeroTier: false,
            coatings: bool('vision_eoc_coatings'),
            contactsVariety: bool('vision_eoc_contacts_variety'),
            upgradeDetail: bool('vision_eoc_upgrade_detail'),
            upgradesFlagPbp: covered(benefitDetails, ['17b5']),
            contactFitting: bool('vision_eoc_contact_fitting'),
        },
    };
}
export const HEARING_EXTRAS_COLUMNS = [
    'hearing_x_batteries', 'hearing_x_otc_aids', 'hearing_x_rechargeable',
    'hearing_x_followup', 'hearing_x_trial', 'hearing_x_warranty',
    'hearing_x_bluetooth', 'hearing_x_vendor_program',
];
export function extractHearingExtras(mirrorRow) {
    const measured = mirrorRow !== null
        && HEARING_EXTRAS_COLUMNS.some((column) => typeof mirrorRow[column] === 'boolean');
    if (!measured) {
        return { batteries: false, otcAids: false, rechargeable: false, followUp: false, trial: false, warranty: false, noData: true };
    }
    const flag = (column) => mirrorRow?.[column] === true;
    const anyTrue = HEARING_EXTRAS_COLUMNS.some(flag);
    return {
        batteries: flag('hearing_x_batteries'),
        otcAids: flag('hearing_x_otc_aids'),
        rechargeable: flag('hearing_x_rechargeable'),
        followUp: flag('hearing_x_followup'),
        trial: flag('hearing_x_trial'),
        warranty: flag('hearing_x_warranty'),
        noData: !anyTrue,
    };
}
export function extractHearingScoringInputs(benefitDetails, mirrorRow, tierCopayRows) {
    let entryTierCopay = null;
    let topTierCopay = null;
    for (const row of tierCopayRows) {
        if (String(row.cost_type ?? '') !== 'copay')
            continue;
        const min = toNumber(row.cost_min);
        const max = toNumber(row.cost_max) ?? min;
        if (min === null)
            continue;
        const perAid = String(row.allowance_scope ?? '') === 'per_item' || row.allowance_scope == null ? min : min;
        if (entryTierCopay === null || perAid < entryTierCopay)
            entryTierCopay = perAid;
        if (max !== null && (topTierCopay === null || max > topTierCopay))
            topTierCopay = max;
    }
    const modelRaw = String(mirrorRow?.hearing_aid_benefit_model ?? '');
    const benefitModel = HEARING_BENEFIT_MODELS.has(modelRaw)
        ? modelRaw : null;
    const aidsCovered = covered(benefitDetails, ['18b', '18c'])
        || benefitModel !== null || tierCopayRows.length > 0;
    return {
        examCovered: examLaneCovered(benefitDetails, '18a', ['18a1', '18a2']),
        examRoutineCopay: serviceRowCopay(benefitDetails, ['18a1']),
        examFittingCopay: serviceRowCopay(benefitDetails, ['18a2']),
        aidsCovered,
        benefitModel,
        aidMax: null,
        perearCode: toNumber(mirrorRow?.hearing_perear_code),
        maxPeriodicityCode: null,
        mirrorPairCapacity: toNumber(mirrorRow?.hearing_annualized_pair_capacity),
        aidsPeriodicityCode: null,
        entryTierCopay,
        topTierCopay,
        aidCopayRangeMin: toNumber(mirrorRow?.hearing_aid_copay_min),
        extras: extractHearingExtras(mirrorRow),
    };
}
