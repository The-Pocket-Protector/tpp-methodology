import * as Sentry from '../../shared/telemetry.mjs';
export const NULLISH_MONEY = new Set(['', 'N/A', 'NOT APPLICABLE', 'NOT AVAILABLE', 'NOT ENOUGH DATA AVAILABLE', 'NA', 'NULL']);
export function firstValue(row, keys) {
    for (const key of keys) {
        if (row && Object.prototype.hasOwnProperty.call(row, key) && row[key] !== undefined && row[key] !== null) {
            return row[key];
        }
    }
    return null;
}
export function normalizeText(value) {
    if (value === undefined || value === null)
        return null;
    const out = String(value).trim();
    return out ? out : null;
}
export function normalizeContractId(value) {
    const out = normalizeText(value);
    return out ? out.toUpperCase() : null;
}
export function normalizePlanId(value) {
    const out = normalizeText(value);
    if (!out)
        return null;
    return /^\d+$/.test(out) ? out.padStart(3, '0') : out;
}
export function normalizeSegmentId(value) {
    const out = normalizeText(value);
    if (!out)
        return '000';
    return /^\d+$/.test(out) ? out.padStart(3, '0') : out;
}
export function parseCmsMoney(value) {
    if (value === undefined || value === null)
        return null;
    if (typeof value === 'number')
        return Number.isFinite(value) ? value : null;
    const raw = String(value).trim();
    if (NULLISH_MONEY.has(raw.toUpperCase()))
        return null;
    const n = parseFloat(raw.replace(/[$,]/g, ''));
    return Number.isFinite(n) ? n : null;
}
export function parseCmsInteger(value) {
    if (value === undefined || value === null)
        return null;
    if (typeof value === 'number')
        return Number.isInteger(value) ? value : null;
    const raw = String(value).trim();
    if (!/^\d+$/.test(raw))
        return null;
    return parseInt(raw, 10);
}
export function normalizeYesNo(value) {
    if (value === true)
        return 'Y';
    if (value === false)
        return 'N';
    const out = normalizeText(value);
    if (!out)
        return 'N';
    return ['Y', 'YES', 'TRUE', '1'].includes(out.toUpperCase()) ? 'Y' : 'N';
}
export function normalizeCostType(value) {
    const out = normalizeText(value);
    if (!out)
        return null;
    const upper = out.toUpperCase();
    if (upper === '1' || upper === 'COPAY')
        return 'Copay';
    if (upper === '2' || upper === 'COINSURANCE')
        return 'Coinsurance';
    return out;
}
export function requireField(name, value) {
    if (value === undefined || value === null || value === '') {
        throw new Error(`missing ${name}`);
    }
}
export function normalizePdpPlanInfoRow(row) {
    const contractId = normalizeContractId(firstValue(row, ['CONTRACT_ID', 'contract_id', 'contractId']));
    const planId = normalizePlanId(firstValue(row, ['PLAN_ID', 'plan_id', 'planId']));
    const segmentId = normalizeSegmentId(firstValue(row, ['SEGMENT_ID', 'segment_id', 'segmentId']));
    const planName = normalizeText(firstValue(row, ['PLAN_NAME', 'plan_name', 'planName']));
    const contractName = normalizeText(firstValue(row, ['CONTRACT_NAME', 'contract_name', 'contractName']));
    const formularyId = normalizeText(firstValue(row, ['FORMULARY_ID', 'formulary_id', 'formularyId']));
    requireField('CONTRACT_ID', contractId);
    requireField('PLAN_ID', planId);
    return {
        CONTRACT_ID: contractId,
        PLAN_ID: planId,
        SEGMENT_ID: segmentId,
        PLAN_NAME: planName,
        CONTRACT_NAME: contractName,
        FORMULARY_ID: formularyId,
        PREMIUM: normalizeText(firstValue(row, ['PREMIUM', 'premium'])) || '0',
        DEDUCTIBLE: normalizeText(firstValue(row, ['DEDUCTIBLE', 'deductible'])) || null,
        PDP_REGION_CODE: normalizeText(firstValue(row, ['PDP_REGION_CODE', 'pdp_region_code', 'pdpRegionCode'])),
        STATE: normalizeText(firstValue(row, ['STATE', 'state'])),
        COUNTY_CODE: normalizeText(firstValue(row, ['COUNTY_CODE', 'county_code', 'countyCode'])),
        PLAN_SUPPRESSED_YN: normalizeText(firstValue(row, ['PLAN_SUPPRESSED_YN', 'plan_suppressed_yn', 'planSuppressedYn'])),
    };
}
export function adaptPdpPlanInfoRows(rows) {
    try {
        Sentry.addBreadcrumb({ category: 'app', message: 'recommendation-adapters.adaptPdpPlanInfoRows started', level: 'info' });
    }
    catch (_bErr) {
    }
    try {
        const normalized = [];
        const rejected = [];
        (rows || []).forEach((row, index) => {
            try {
                normalized.push(normalizePdpPlanInfoRow(row));
            }
            catch (error) {
                rejected.push({ index, reason: error.message });
            }
        });
        return { rows: normalized, rejected };
    }
    catch (err) {
        try {
            Sentry.addBreadcrumb({ category: 'app', message: 'recommendation-adapters.adaptPdpPlanInfoRows failed', level: 'error' });
        }
        catch (_bErr) {
        }
        throw err;
    }
}
export function normalizePdpFormularyDrugRow(row) {
    const formularyId = normalizeText(firstValue(row, ['FORMULARY_ID', 'formulary_id', 'formularyId']));
    const rxcui = normalizeText(firstValue(row, ['RXCUI', 'rxcui']));
    const tier = parseCmsInteger(firstValue(row, ['TIER_LEVEL_VALUE', 'tier_level_value', 'tierLevelValue']));
    requireField('FORMULARY_ID', formularyId);
    requireField('RXCUI', rxcui);
    if (tier === null || tier < 1 || tier > 99)
        throw new Error('invalid TIER_LEVEL_VALUE');
    return {
        FORMULARY_ID: formularyId,
        RXCUI: rxcui,
        TIER_LEVEL_VALUE: String(tier),
        PRIOR_AUTHORIZATION_YN: normalizeYesNo(firstValue(row, ['PRIOR_AUTHORIZATION_YN', 'prior_authorization_yn', 'priorAuthorizationYn'])),
        STEP_THERAPY_YN: normalizeYesNo(firstValue(row, ['STEP_THERAPY_YN', 'step_therapy_yn', 'stepTherapyYn'])),
        QUANTITY_LIMIT_YN: normalizeYesNo(firstValue(row, ['QUANTITY_LIMIT_YN', 'quantity_limit_yn', 'quantityLimitYn'])),
        NDC: normalizeText(firstValue(row, ['NDC', 'ndc'])),
    };
}
export function adaptPdpFormularyDrugRows(rows) {
    try {
        Sentry.addBreadcrumb({ category: 'app', message: 'recommendation-adapters.adaptPdpFormularyDrugRows started', level: 'info' });
    }
    catch (_bErr) {
    }
    try {
        const normalized = [];
        const rejected = [];
        (rows || []).forEach((row, index) => {
            try {
                normalized.push(normalizePdpFormularyDrugRow(row));
            }
            catch (error) {
                rejected.push({ index, reason: error.message });
            }
        });
        return { rows: normalized, rejected };
    }
    catch (err) {
        try {
            Sentry.addBreadcrumb({ category: 'app', message: 'recommendation-adapters.adaptPdpFormularyDrugRows failed', level: 'error' });
        }
        catch (_bErr) {
        }
        throw err;
    }
}
export function normalizePdpBeneficiaryCostRow(row) {
    return {
        COST_TYPE_PREF: normalizeCostType(firstValue(row, ['COST_TYPE_PREF', 'cost_type_pref', 'costTypePref'])),
        COST_AMT_PREF: parseCmsMoney(firstValue(row, ['COST_AMT_PREF', 'cost_amt_pref', 'costAmtPref'])),
        COST_TYPE_NONPREF: normalizeCostType(firstValue(row, ['COST_TYPE_NONPREF', 'cost_type_nonpref', 'costTypeNonpref'])),
        COST_AMT_NONPREF: parseCmsMoney(firstValue(row, ['COST_AMT_NONPREF', 'cost_amt_nonpref', 'costAmtNonpref'])),
        COST_TYPE_MAIL_PREF: normalizeCostType(firstValue(row, ['COST_TYPE_MAIL_PREF', 'cost_type_mail_pref', 'costTypeMailPref'])),
        COST_AMT_MAIL_PREF: parseCmsMoney(firstValue(row, ['COST_AMT_MAIL_PREF', 'cost_amt_mail_pref', 'costAmtMailPref'])),
        COST_TYPE_MAIL_NONPREF: normalizeCostType(firstValue(row, ['COST_TYPE_MAIL_NONPREF', 'cost_type_mail_nonpref', 'costTypeMailNonpref'])),
        COST_AMT_MAIL_NONPREF: parseCmsMoney(firstValue(row, ['COST_AMT_MAIL_NONPREF', 'cost_amt_mail_nonpref', 'costAmtMailNonpref'])),
        DED_APPLIES_YN: normalizeYesNo(firstValue(row, ['DED_APPLIES_YN', 'ded_applies_yn', 'dedAppliesYn'])),
    };
}
export function normalizeMaSegmentId(value) {
    const out = normalizeText(value);
    return out || '0';
}
export function parseBenefitJsonValue(value) {
    if (value === undefined || value === null || value === '')
        return null;
    if (typeof value === 'object' && !Array.isArray(value))
        return value;
    if (typeof value !== 'string')
        return null;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    }
    catch (_error) {
        return null;
    }
}
export function maPlanIncludesPartD(partDCoverage) {
    const value = String(partDCoverage || '').toLowerCase();
    return value !== 'no' && value !== '' && value !== 'n/a';
}
export function normalizeMaLandscapePlanRow(row) {
    const contractId = normalizeContractId(firstValue(row, ['contract_id', 'contractId', 'CONTRACT_ID']));
    const planId = normalizePlanId(firstValue(row, ['plan_id', 'planId', 'PLAN_ID']));
    const segmentId = normalizeMaSegmentId(firstValue(row, ['segment_id', 'segmentId', 'SEGMENT_ID']));
    requireField('contract_id', contractId);
    requireField('plan_id', planId);
    return {
        contract_id: contractId,
        plan_id: planId,
        segment_id: segmentId,
        plan_name: normalizeText(firstValue(row, ['plan_name', 'planName', 'PLAN_NAME'])),
        org_name: normalizeText(firstValue(row, ['org_name', 'orgName', 'organization_name', 'organizationName', 'ORG_NAME'])),
        plan_type: normalizeText(firstValue(row, ['plan_type', 'planType', 'PLAN_TYPE'])),
        snp_type: normalizeText(firstValue(row, ['snp_type', 'snpType', 'SNP_TYPE'])),
        part_c_premium: normalizeText(firstValue(row, ['part_c_premium', 'partCPremium', 'PART_C_PREMIUM'])),
        part_d_premium: normalizeText(firstValue(row, ['part_d_premium', 'partDPremium', 'PART_D_PREMIUM'])),
        consolidated_premium: normalizeText(firstValue(row, ['consolidated_premium', 'consolidatedPremium', 'CONSOLIDATED_PREMIUM'])),
        moop_in_network: normalizeText(firstValue(row, ['moop_in_network', 'moopInNetwork', 'MOOP_IN_NETWORK'])),
        star_rating_overall: normalizeText(firstValue(row, ['star_rating_overall', 'starRatingOverall', 'STAR_RATING_OVERALL'])),
        county: normalizeText(firstValue(row, ['county', 'COUNTY'])),
        state: normalizeText(firstValue(row, ['state', 'STATE'])),
        part_d_coverage: normalizeText(firstValue(row, ['part_d_coverage', 'partDCoverage', 'PART_D_COVERAGE'])),
        part_d_deductible: normalizeText(firstValue(row, ['part_d_deductible', 'partDDeductible', 'PART_D_DEDUCTIBLE'])),
    };
}
export function adaptMaLandscapePlanRows(rows) {
    try {
        Sentry.addBreadcrumb({ category: 'app', message: 'recommendation-adapters.adaptMaLandscapePlanRows started', level: 'info' });
    }
    catch (_bErr) {
    }
    try {
        const normalized = [];
        const rejected = [];
        (rows || []).forEach((row, index) => {
            try {
                normalized.push(normalizeMaLandscapePlanRow(row));
            }
            catch (error) {
                rejected.push({ index, reason: error.message });
            }
        });
        return { rows: normalized, rejected };
    }
    catch (err) {
        try {
            Sentry.addBreadcrumb({ category: 'app', message: 'recommendation-adapters.adaptMaLandscapePlanRows failed', level: 'error' });
        }
        catch (_bErr) {
        }
        throw err;
    }
}
export function normalizeMaPartBReductionRow(row) {
    const contractId = normalizeContractId(firstValue(row, ['contract_id', 'contractId', 'CONTRACT_ID']));
    const planId = normalizePlanId(firstValue(row, ['plan_id', 'planId', 'PLAN_ID']));
    const segmentId = normalizeMaSegmentId(firstValue(row, ['segment_id', 'segmentId', 'SEGMENT_ID']));
    requireField('contract_id', contractId);
    requireField('plan_id', planId);
    return {
        contract_id: contractId,
        plan_id: planId,
        segment_id: segmentId,
        part_b_premium_reduction: parseCmsMoney(firstValue(row, ['part_b_premium_reduction', 'partBPremiumReduction', 'PART_B_PREMIUM_REDUCTION', 'reduction_amount', 'reductionAmount'])),
    };
}
export function normalizeMaBenefitDetailRow(row) {
    const contractId = normalizeContractId(firstValue(row, ['contract_id', 'contractId', 'CONTRACT_ID']));
    const planId = normalizePlanId(firstValue(row, ['plan_id', 'planId', 'PLAN_ID']));
    const segmentId = normalizeMaSegmentId(firstValue(row, ['segment_id', 'segmentId', 'SEGMENT_ID']));
    const categoryCode = normalizeText(firstValue(row, ['category_code', 'categoryCode', 'CATEGORY_CODE']));
    requireField('contract_id', contractId);
    requireField('plan_id', planId);
    return {
        contract_id: contractId,
        plan_id: planId,
        segment_id: segmentId,
        category_code: categoryCode,
        benefit_json: parseBenefitJsonValue(firstValue(row, ['benefit_json', 'benefitJson', 'BENEFIT_JSON'])),
    };
}
export function normalizeMaVbidRow(row) {
    const contractId = normalizeContractId(firstValue(row, ['contract_id', 'contractId', 'CONTRACT_ID']));
    const planId = normalizePlanId(firstValue(row, ['plan_id', 'planId', 'PLAN_ID']));
    const segmentId = normalizeMaSegmentId(firstValue(row, ['segment_id', 'segmentId', 'SEGMENT_ID']));
    requireField('contract_id', contractId);
    requireField('plan_id', planId);
    return {
        contract_id: contractId,
        plan_id: planId,
        segment_id: segmentId,
        vbid_json: parseBenefitJsonValue(firstValue(row, ['vbid_json', 'vbidJson', 'VBID_JSON'])),
    };
}
