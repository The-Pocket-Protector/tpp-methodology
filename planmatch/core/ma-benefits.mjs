export function rec(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}
export function toArray(value) {
    if (!value)
        return [];
    return Array.isArray(value) ? value : [value];
}
export function parseAmount(value) {
    if (value === null || value === undefined || value === '')
        return null;
    const amount = Number(String(value).replace(/[$,]/g, ''));
    return Number.isFinite(amount) && amount > 0 ? amount : null;
}
export function formatDollars(amount) {
    return `$${Math.round(amount).toLocaleString('en-US')}`;
}
export const PBP_PERIODICITY_DECODE = {
    '1': { months: 36, factor: 1 / 3, suffix: ' per 3 years' },
    '2': { months: 24, factor: 1 / 2, suffix: ' per 2 years' },
    '3': { months: 12, factor: 1, suffix: '/yr' },
    '4': { months: 6, factor: 2, suffix: ' per 6 months' },
    '5': { months: 3, factor: 4, suffix: '/quarter' },
    '6': { months: null, factor: 1, suffix: '' },
    '7': { months: 1, factor: 12, suffix: '/month' },
};
export const PBP_PERIODICITY_SUFFIXES = Object.fromEntries(Object.entries(PBP_PERIODICITY_DECODE).map(([code, decode]) => [code, decode.suffix]));
export const PBP_PERIODICITY_ANNUALIZATION_FACTORS = Object.fromEntries(Object.entries(PBP_PERIODICITY_DECODE).map(([code, decode]) => [code, decode.factor]));
export const PBP_PERIODICITY_MONTHS = Object.fromEntries(Object.entries(PBP_PERIODICITY_DECODE).flatMap(([code, decode]) => (decode.months === null ? [] : [[code, decode.months]])));
export function periodSuffix(periodicity) {
    return PBP_PERIODICITY_SUFFIXES[String(periodicity ?? '')] ?? '';
}
export function formatAllowance(amount, periodicity, label) {
    const suffix = periodSuffix(periodicity);
    return suffix.startsWith('/')
        ? `${formatDollars(amount)}${suffix} ${label}`
        : `${formatDollars(amount)} ${label}${suffix}`;
}
export function findFirstAmount(items, paths) {
    for (const item of toArray(items)) {
        for (const path of paths) {
            let cursor = item;
            for (const key of path) {
                const cursorRec = rec(cursor);
                cursor = cursorRec ? cursorRec[key] : undefined;
            }
            const amount = parseAmount(cursor);
            if (amount !== null)
                return { amount, item };
        }
    }
    return null;
}
export function hasMeaningfulCoverage(benefitJson) {
    for (const item of toArray(benefitJson)) {
        const copay = rec(item.CopaymentComponent) || rec(item.DentalCopaymentComponent) || {};
        const coins = rec(item.CoinsuranceComponent) || rec(item.DentalCoinsuranceComponent) || {};
        const hasCopay = ['1', '3'].includes(String(copay.bdCopaymentAmountYesNoMinMax ?? copay.bdDentalCopaymentAmountYesNoMinMax ?? ''));
        const hasCoins = ['1', '3'].includes(String(coins.bdCoinsuranceAmountYesNoMinMax ?? coins.bdDentalCoinsurancePerYesNoMinMax ?? ''));
        const maxCoverage = rec(item.PlanBenefitCoverageComponent)?.bdMaximumPlanBenefitCoverageYesNo === '1';
        if (hasCopay || hasCoins || maxCoverage)
            return true;
    }
    return false;
}
export function getVbidPackages(vbidData) {
    const vbid = rec(vbidData);
    if (!vbid)
        return [];
    const additionalBenefits = rec(vbid.vbidAdditionalBenefits);
    return [
        ...toArray(vbid.packages),
        ...toArray(vbid.vbidAbpPackages),
        ...toArray(additionalBenefits?.vbidAdditionalBenefitsPackages),
    ];
}
export function isVbidEnabled(vbidData) {
    const vbid = rec(vbidData);
    if (!vbid)
        return false;
    const uniformityDetails = rec(vbid.vbidMAUniformitySSBCIDetails);
    return vbid.vbidMaSsbciAddBen === '1'
        || uniformityDetails?.vbidMaSsbciAddBen === '1'
        || getVbidPackages(vbidData).length > 0;
}
export function selectionIncludes(selection, categoryCodes) {
    if (Array.isArray(selection))
        return selection.some(value => categoryCodes.includes(String(value)));
    return String(selection || '')
        .split(',')
        .map(value => value.trim())
        .some(value => categoryCodes.includes(value));
}
export function hasVbidBenefit(vbidData, categoryCodes) {
    if (!isVbidEnabled(vbidData))
        return false;
    for (const pkg of getVbidPackages(vbidData)) {
        if (selectionIncludes(pkg.vbidAbpNonMedBenSel, categoryCodes))
            return true;
        if (selectionIncludes(pkg.vbidAbpMaxBenSel, categoryCodes))
            return true;
        if (selectionIncludes(pkg.vbidAbpExemptNonMed, categoryCodes))
            return true;
    }
    return false;
}
export function extractOtcLabel(vbidData) {
    if (!hasVbidBenefit(vbidData, ['14c8']))
        return null;
    for (const pkg of getVbidPackages(vbidData)) {
        if (!selectionIncludes(pkg.vbidAbpNonMedBenSel, ['14c8']) && !selectionIncludes(pkg.vbidAbpMaxBenSel, ['14c8']))
            continue;
        const amount = parseAmount(pkg.vbidAbpMaxAmt);
        if (amount)
            return `${formatDollars(amount)} OTC card`;
    }
    return 'OTC card';
}
export function parseAmountAllowZero(value) {
    if (value === null || value === undefined || value === '')
        return null;
    const n = Number(String(value).replace(/[$,]/g, ''));
    return Number.isFinite(n) ? n : null;
}
export function formatCopay(amount) {
    return amount === 0 ? '$0 copay' : `$${Math.round(amount).toLocaleString('en-US')} copay`;
}
export function formatCopayRange(min, max) {
    if (min !== null && max !== null && min !== max) {
        return `$${Math.round(min).toLocaleString('en-US')}–$${Math.round(max).toLocaleString('en-US')} copay`;
    }
    const amount = max ?? min ?? 0;
    return amount === 0 ? '$0 copay' : `$${Math.round(amount).toLocaleString('en-US')} copay`;
}
export function extractStandardCopay(copay, opts) {
    const copayRec = rec(copay);
    if (!copayRec || !['1', '3'].includes(String(copayRec.bdCopaymentAmountYesNoMinMax ?? '')))
        return null;
    if (copayRec.bdCopaymentAmountYesNoMinMax === '3') {
        const min = parseAmountAllowZero(copayRec.bdCopaymentMinAmount);
        const max = parseAmountAllowZero(copayRec.bdCopaymentMaxAmount);
        if (opts?.collapseZeroFloorRange && min === 0 && max !== null)
            return formatCopay(max);
        if (min !== null || max !== null)
            return formatCopayRange(min ?? max, max ?? min);
    }
    const amount = parseAmountAllowZero(copayRec.bdCopaymentAmount ?? copayRec.bdCopaymentMaxAmount ?? copayRec.bdCopaymentMinAmount);
    if (amount !== null)
        return formatCopay(amount);
    return null;
}
export function extractAdmWaivedHospitalCopay(item) {
    const comp = rec(item.CopaymentAdmissionWaivedHospitalComponent);
    if (!comp)
        return null;
    const copayComp = rec(comp.bdCopayComponent);
    if (!copayComp || !['1', '3'].includes(String(copayComp.bdCopaymentAmountYesNoMinMax ?? '')))
        return null;
    const amount = parseAmountAllowZero(copayComp.bdCopaymentAmount ?? copayComp.bdCopaymentMaxAmount ?? copayComp.bdCopaymentMinAmount);
    if (amount === null)
        return null;
    let label = formatCopay(amount);
    if (comp.bdCopaymentAdmissionWaivedHospitalYesNo === '1') {
        label += ' (waived if admitted)';
    }
    return label;
}
export function hasWorldwideCoverage(benefitDetails) {
    for (const code of ['4c1', '4c2']) {
        for (const item of toArray(benefitDetails?.get(code))) {
            if (item && extractAdmWaivedHospitalCopay(item) !== null)
                return true;
        }
    }
    return false;
}
export function extractHearingAidCopayLabel(benefitJson) {
    for (const item of toArray(benefitJson)) {
        if (!item)
            continue;
        const label = extractStandardCopay(item.CopaymentComponent);
        if (label)
            return `${label} per hearing aid`;
    }
    return null;
}
export const DENTAL_PREVENTIVE_CODES = ['16b', '16b1', '16b2', '16b3', '16b4', '16b5', '16b6'];
export const DENTAL_COMPREHENSIVE_CODES = [
    '16c', '16c1', '16c2', '16c3', '16c4', '16c5', '16c6', '16c7', '16c8', '16c9', '16c10',
];
export const COMBINED_SUPPLEMENTAL_LABELS = [
    ['13a', 'acupuncture'],
    ['13b', 'OTC'],
    ['14c4', 'fitness'],
    ['16b', 'dental'],
    ['16c', 'dental'],
    ['17', 'vision'],
    ['18', 'hearing'],
    ['7b1', 'chiropractic'],
];
export const SHARED_POOL_LABELS = {
    dental: 'dental', vision: 'vision', hearing: 'hearing', otc: 'OTC',
    fitness: 'fitness', acupuncture: 'acupuncture', chiropractic: 'chiropractic',
};
export function sharedPoolLabels(slugs) {
    const labels = new Set();
    for (const slug of slugs)
        labels.add(SHARED_POOL_LABELS[slug] ?? slug.replace(/_/g, ' '));
    return [...labels];
}
export function dentalPeriodFacts(periodicity) {
    const code = String(periodicity ?? '').trim();
    return {
        periodicity_code: code || null,
        period_months: code ? PBP_PERIODICITY_MONTHS[code] ?? null : null,
        annual_capacity: null,
    };
}
export function buildDentalCap(scope, funding, amount, periodicity, sharedWith = []) {
    const period = dentalPeriodFacts(periodicity);
    const factor = period.periodicity_code
        ? PBP_PERIODICITY_ANNUALIZATION_FACTORS[period.periodicity_code]
        : undefined;
    return {
        scope,
        funding,
        amount,
        ...period,
        annual_capacity: factor === undefined ? null : Math.round(amount * factor * 100) / 100,
        shared_with: sharedWith,
    };
}
export function parseJsonRecord(value) {
    if (typeof value === 'string') {
        try {
            return rec(JSON.parse(value));
        }
        catch {
            return null;
        }
    }
    return rec(value);
}
export function combinedSupplementalRows(costSharingData) {
    const parsed = parseJsonRecord(costSharingData);
    if (!parsed)
        return [];
    const root = rec(parsed.costShareGroups) ?? parsed;
    const combined = rec(root.combinedSupplementalBenefits);
    const details = rec(combined?.combinedSupplementalBenefitsDetails);
    return toArray(details?.combNetworkGroupData);
}
export function selectedCombinedCodes(value) {
    const values = Array.isArray(value) ? value : String(value ?? '').split(',');
    return values.map(code => String(code).trim()).filter(Boolean);
}
export function sharedBenefitLabels(codes) {
    const labels = new Set();
    for (const code of codes) {
        const match = COMBINED_SUPPLEMENTAL_LABELS.find(([prefix]) => code === prefix || code.startsWith(prefix));
        if (match)
            labels.add(match[1]);
    }
    return [...labels];
}
export function extractDentalCaps({ benefitDetails, costSharingData, sharedPool }) {
    let preventive = null;
    for (const item of toArray(benefitDetails?.get('16b'))) {
        const max = rec(item.PlanBenefitCoverageComponent);
        if (!max || String(max.bdMaximumPlanBenefitCoverageYesNo ?? '') !== '1')
            continue;
        const amount = parseAmount(max.bdMaximumAmount);
        if (amount !== null) {
            preventive = { amount, periodicity: max.bdCoveragePeriodicity };
            break;
        }
    }
    let comprehensiveAmount = null;
    let comprehensivePeriodicity = null;
    let comprehensiveRelationship = null;
    for (const item of toArray(benefitDetails?.get('16c'))) {
        const max = rec(item.MaxPlancoverageComprehensiveDentalComponent);
        if (!max || String(max.bdMaxPlanComprehensiveDentalYesNo ?? '') !== '1')
            continue;
        comprehensiveRelationship = String(max.bdMaxPlanComprehensiveDentalRadioOpts ?? '').trim() || null;
        comprehensiveAmount = parseAmount(max.bdMaxPlanComprehensiveDentalAmount);
        comprehensivePeriodicity = max.bdMaxPlanComprehensiveDentalPeriodicity;
        break;
    }
    const caps = [];
    if (comprehensiveRelationship === '1' && preventive) {
        caps.push(buildDentalCap('preventive_and_comprehensive', 'dedicated', preventive.amount, preventive.periodicity));
    }
    else {
        if (preventive) {
            caps.push(buildDentalCap('preventive', 'dedicated', preventive.amount, preventive.periodicity));
        }
        if (comprehensiveAmount !== null) {
            caps.push(buildDentalCap('comprehensive', comprehensiveRelationship === '2' ? 'dedicated' : 'unknown', comprehensiveAmount, comprehensivePeriodicity));
        }
    }
    for (const row of combinedSupplementalRows(costSharingData)) {
        if (String(row.combSuppBenMaxAmnt ?? '') !== '1')
            continue;
        const amount = parseAmount(row.maxPlanBenCovAmnt);
        if (amount === null)
            continue;
        const codes = selectedCombinedCodes(row.nonMedCovBenCombSupp);
        const hasPreventive = codes.some(code => code === '16b' || code.startsWith('16b'));
        const hasComprehensive = codes.some(code => code === '16c' || code.startsWith('16c'));
        if (!hasPreventive && !hasComprehensive)
            continue;
        const scope = hasPreventive && hasComprehensive
            ? 'preventive_and_comprehensive'
            : hasPreventive ? 'preventive' : 'comprehensive';
        const sharedWith = sharedBenefitLabels(codes);
        const nonDentalBenefits = sharedWith.filter(label => label !== 'dental');
        const funding = nonDentalBenefits.length > 0 ? 'shared' : 'dedicated';
        let sharedCap = buildDentalCap(scope, funding, amount, row.combSuppBenMaxAmntPrdty, funding === 'shared' ? sharedWith : []);
        const duplicateIndex = caps.findIndex(cap => cap.amount === sharedCap.amount
            && cap.periodicity_code === sharedCap.periodicity_code
            && (cap.scope === scope || cap.scope === 'preventive_and_comprehensive'));
        if (duplicateIndex >= 0) {
            if (caps[duplicateIndex].scope === 'preventive_and_comprehensive') {
                sharedCap = { ...sharedCap, scope: 'preventive_and_comprehensive' };
            }
            caps.splice(duplicateIndex, 1, sharedCap);
        }
        else
            caps.push(sharedCap);
    }
    return applyAdjudicatedSharing(caps, sharedPool);
}
export function applyAdjudicatedSharing(caps, adjudicated) {
    if (caps.length === 0 || !adjudicated)
        return caps;
    const sharedWith = sharedPoolLabels(adjudicated.applies_to);
    return caps.map(cap => (cap.amount === adjudicated.dental_pot
        ? { ...cap, funding: 'shared', shared_with: sharedWith }
        : cap));
}
export function dentalScopeLabel(scope) {
    if (scope === 'preventive')
        return 'preventive dental allowance';
    if (scope === 'comprehensive')
        return 'comprehensive dental allowance';
    return 'preventive & comprehensive dental allowance';
}
export function formatDentalCaps(caps) {
    if (caps.length === 0)
        return null;
    return caps.map(cap => {
        const base = formatAllowance(cap.amount, cap.periodicity_code, dentalScopeLabel(cap.scope));
        const nonDental = cap.shared_with.filter(label => label !== 'dental');
        if (cap.funding === 'shared' && nonDental.length > 0)
            return `${base} shared with ${nonDental.join(', ')}`;
        if (cap.funding === 'shared')
            return `${base} from a shared supplemental-benefit wallet`;
        if (cap.funding === 'unknown')
            return `${base} (sharing not stated)`;
        return base;
    }).join(' · ');
}
export function findComprehensiveDentalMax(benefitJson) {
    for (const item of toArray(benefitJson)) {
        if (!item)
            continue;
        const max = rec(item.MaxPlancoverageComprehensiveDentalComponent);
        if (!max || String(max.bdMaxPlanComprehensiveDentalYesNo ?? '') !== '1')
            continue;
        const amount = parseAmount(max.bdMaxPlanComprehensiveDentalAmount);
        if (amount !== null)
            return { amount, periodicity: max.bdMaxPlanComprehensiveDentalPeriodicity };
    }
    return null;
}
export function extractDentalCostShareLabel(benefitDetails) {
    const covers = (codes) => codes.some(code => hasMeaningfulCoverage(benefitDetails?.get(code)));
    const preventive = covers(DENTAL_PREVENTIVE_CODES);
    const comprehensive = covers(DENTAL_COMPREHENSIVE_CODES);
    if (!preventive && !comprehensive)
        return null;
    const scope = preventive && comprehensive
        ? 'Preventive & comprehensive dental'
        : preventive ? 'Preventive dental' : 'Comprehensive dental';
    const codes = [...DENTAL_PREVENTIVE_CODES, ...DENTAL_COMPREHENSIVE_CODES];
    return `${scope} (${hasNonzeroDentalCostShare(benefitDetails, codes) ? 'cost sharing varies by service' : '$0 copay'})`;
}
export function hasNonzeroDentalCostShare(benefitDetails, codes) {
    for (const code of codes) {
        for (const item of toArray(benefitDetails?.get(code))) {
            if (!item)
                continue;
            const copay = rec(item.CopaymentComponent) || rec(item.DentalCopaymentComponent) || {};
            const copayYn = String(copay.bdCopaymentAmountYesNoMinMax ?? copay.bdDentalCopaymentAmountYesNoMinMax ?? '');
            if (copayYn === '3')
                return true;
            if (copayYn === '1') {
                const amount = parseAmountAllowZero(copay.bdCopaymentAmount ?? copay.bdDentalCopaymentAmount);
                if (amount !== null && amount > 0)
                    return true;
            }
            const coins = rec(item.CoinsuranceComponent) || rec(item.DentalCoinsuranceComponent) || {};
            if (['1', '3'].includes(String(coins.bdCoinsuranceAmountYesNoMinMax ?? coins.bdDentalCoinsurancePerYesNoMinMax ?? ''))) {
                const pct = parseAmountAllowZero(coins.bdCoinsuranceAmount ?? coins.bdDentalCoinsurancePer
                    ?? coins.bdCoinsuranceMaxAmount ?? coins.bdDentalCoinsuranceMaxPer);
                if (pct !== null && pct > 0)
                    return true;
            }
        }
    }
    return false;
}
export function extractOtc13bLabel(benefitJson) {
    for (const item of toArray(benefitJson)) {
        if (!item)
            continue;
        const label = extractStandardCopay(item.CopaymentComponent);
        if (label === '$0 copay')
            return 'OTC benefit ($0 copay)';
        if (label)
            return 'OTC benefit';
    }
    return null;
}
export function sharedAllowanceLanes({ benefitDetails, sharedPool }) {
    if (!sharedPool)
        return { vision: false, hearing: false };
    const eyewear = findFirstAmount(benefitDetails?.get('17b'), [
        ['MaxPlancoverageAmountPeriodicityEyewearComponent', 'bdMaxPlanAmtPeriodMaxBenfitEyeCombinedMaxAmount'],
    ]);
    const aid = findFirstAmount(benefitDetails?.get('18b'), [
        ['MaxPlancoverageHearingAidsComponent', 'bdMaxPlanHearingAidsAmount'],
    ]);
    return {
        vision: eyewear?.amount === sharedPool.dental_pot,
        hearing: aid?.amount === sharedPool.dental_pot,
    };
}
export function sharedWithSuffix(sharedPool, ownCategory) {
    const others = sharedPoolLabels(sharedPool.applies_to).filter(label => label !== ownCategory);
    return others.length > 0 ? ` shared with ${others.join(', ')}` : '';
}
export function extractSupplementalBenefits({ benefitDetails, dentalRows = [], vbidData, costSharingData, sharedPool, }) {
    const benefits = {};
    const structuredDental = formatDentalCaps(extractDentalCaps({ benefitDetails, costSharingData, sharedPool }));
    const dentalAmount = dentalRows
        .map(row => ({
        amount: parseAmount(row.plan_benefit_max_amount),
        periodicity: row.plan_benefit_periodicity,
    }))
        .filter((row) => row.amount !== null)
        .sort((a, b) => b.amount - a.amount)[0];
    const preventiveMax = findFirstAmount(benefitDetails?.get('16b'), [
        ['PlanBenefitCoverageComponent', 'bdMaximumAmount'],
    ]);
    const pbpDentalMax = [
        preventiveMax && {
            amount: preventiveMax.amount,
            periodicity: rec(preventiveMax.item.PlanBenefitCoverageComponent)?.bdCoveragePeriodicity,
        },
        findComprehensiveDentalMax(benefitDetails?.get('16c')),
    ]
        .filter((max) => max !== null && max !== undefined)
        .sort((a, b) => b.amount - a.amount)[0];
    const dental = dentalAmount || pbpDentalMax;
    if (structuredDental) {
        benefits.dental = structuredDental;
    }
    else if (dental) {
        benefits.dental = formatAllowance(dental.amount, dental.periodicity, 'allowance');
    }
    else {
        const dentalCostShare = extractDentalCostShareLabel(benefitDetails);
        if (dentalCostShare)
            benefits.dental = dentalCostShare;
    }
    const sharedLanes = sharedAllowanceLanes({ benefitDetails, sharedPool });
    const vision = findFirstAmount(benefitDetails?.get('17b'), [
        ['MaxPlancoverageAmountPeriodicityEyewearComponent', 'bdMaxPlanAmtPeriodMaxBenfitEyeCombinedMaxAmount'],
    ]);
    if (vision) {
        const periodicity = rec(vision.item.MaxPlancoverageAmountPeriodicityEyewearComponent)?.bdCoveragePeriodicity;
        benefits.vision = formatAllowance(vision.amount, periodicity, 'allowance')
            + (sharedLanes.vision && sharedPool ? sharedWithSuffix(sharedPool, 'vision') : '');
    }
    else if (hasMeaningfulCoverage(benefitDetails?.get('17a'))) {
        benefits.vision = 'Routine vision benefit';
    }
    const hearing = findFirstAmount(benefitDetails?.get('18b'), [
        ['MaxPlancoverageHearingAidsComponent', 'bdMaxPlanHearingAidsAmount'],
    ]);
    if (hearing) {
        const periodicity = rec(hearing.item.MaxPlancoverageHearingAidsComponent)?.bdMaxPlanHearingAidsPeriodicity;
        benefits.hearing = formatAllowance(hearing.amount, periodicity, 'hearing aid allowance')
            + (sharedLanes.hearing && sharedPool ? sharedWithSuffix(sharedPool, 'hearing') : '');
    }
    else {
        const hearingCopay = extractHearingAidCopayLabel(benefitDetails?.get('18b1'));
        if (hearingCopay)
            benefits.hearing = hearingCopay;
        else if (hasMeaningfulCoverage(benefitDetails?.get('18b')) || hasMeaningfulCoverage(benefitDetails?.get('18c'))) {
            benefits.hearing = 'Hearing aid benefit';
        }
    }
    if (hasMeaningfulCoverage(benefitDetails?.get('14c4'))) {
        benefits.fitness = '$0 fitness benefit';
    }
    const otc = extractOtcLabel(vbidData) || extractOtc13bLabel(benefitDetails?.get('13b'));
    if (otc)
        benefits.otc = otc;
    return benefits;
}
export function extractVisionAllowanceAmount(benefitDetails) {
    const vision = findFirstAmount(benefitDetails?.get('17b'), [
        ['MaxPlancoverageAmountPeriodicityEyewearComponent', 'bdMaxPlanAmtPeriodMaxBenfitEyeCombinedMaxAmount'],
    ]);
    if (!vision)
        return null;
    const periodicity = rec(vision.item.MaxPlancoverageAmountPeriodicityEyewearComponent)?.bdCoveragePeriodicity;
    const factor = PBP_PERIODICITY_ANNUALIZATION_FACTORS[String(periodicity ?? '')] ?? 1;
    return vision.amount * factor;
}
