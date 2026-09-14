import { CSNP_CONDITION_KEYS } from './shared-recommendation-constants.mjs';
export function isCsnpPlan(plan) {
    return /c-?snp|chronic/i.test(String(plan.snp_type || ''));
}
export const ESRD_INCLUDES_KIDNEY_TRANSPLANT_BIT_29 = true;
export const BIT = {
    cardiovascular: 4,
    chf: 5,
    dementia: 6,
    diabetes: 7,
    esrd: 9,
    hiv: 11,
    lung: 12,
    mentalHealth: 13,
    diabetesCardio: 17,
    diabetesChfCardio: 19,
    ckdTransplant: 29,
};
export const CSNP_BITMASK_POSITIONS = {
    diabetes: [BIT.diabetes, BIT.diabetesCardio, BIT.diabetesChfCardio],
    heart: [BIT.cardiovascular, BIT.chf, BIT.diabetesCardio, BIT.diabetesChfCardio],
    copd: [BIT.lung],
    esrd: ESRD_INCLUDES_KIDNEY_TRANSPLANT_BIT_29 ? [BIT.esrd, BIT.ckdTransplant] : [BIT.esrd],
    dementia: [BIT.dementia],
    hiv: [BIT.hiv],
    mental_health: [BIT.mentalHealth],
};
export const CSNP_CONDITION_LABELS = {
    diabetes: ['Diabetes'],
    heart: [
        'Cardiovascular Disorders',
        'Chronic Heart Failure',
        'Heart conditions',
        'Trastornos cardiovasculares',
        'Insuficiencia cardiaca cronica',
        'Condiciones cardiacas',
    ],
    copd: ['Chronic Lung Disorders (COPD)', 'Trastornos pulmonares cronicos (EPOC)'],
    esrd: ['End-Stage Renal Disease (ESRD)', 'Enfermedad renal en etapa final (ESRD)'],
    dementia: ['Dementia', 'Demencia'],
    hiv: ['HIV/AIDS', 'VIH/SIDA'],
    mental_health: ['Chronic & Disabling Mental Health', 'Salud mental cronica e incapacitante'],
};
export const KEY_ORDER = CSNP_CONDITION_KEYS;
export const KEY_SET = new Set(CSNP_CONDITION_KEYS);
export function normalizeCsnpLabel(label) {
    return String(label ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}
export const KEY_BY_NORMALIZED_LABEL = (() => {
    const map = new Map();
    for (const key of KEY_ORDER) {
        for (const label of CSNP_CONDITION_LABELS[key])
            map.set(normalizeCsnpLabel(label), key);
    }
    return map;
})();
export function canonical(keys) {
    const present = new Set(keys);
    return KEY_ORDER.filter((key) => present.has(key));
}
export function isCsnpConditionKey(value) {
    return typeof value === 'string' && KEY_SET.has(value);
}
export function resolveRequestedCsnpKeys({ labels, keys, }) {
    const explicit = canonical(keys.filter(isCsnpConditionKey));
    if (explicit.length > 0)
        return { keys: explicit, source: 'keys', unresolvedLabelCount: 0 };
    const resolved = new Set();
    let unresolvedLabelCount = 0;
    for (const label of labels) {
        const normalized = normalizeCsnpLabel(label);
        if (!normalized)
            continue;
        const key = KEY_BY_NORMALIZED_LABEL.get(normalized);
        if (key)
            resolved.add(key);
        else
            unresolvedLabelCount += 1;
    }
    const list = canonical(resolved);
    return {
        keys: list,
        source: list.length > 0 || unresolvedLabelCount > 0 ? 'labels' : 'none',
        unresolvedLabelCount,
    };
}
export const BITMASK_PATTERN = /^[01]{30,}$/;
export function filedConditionsFromBitmask(mask) {
    if (typeof mask !== 'string' || !BITMASK_PATTERN.test(mask))
        return null;
    const filed = new Set();
    for (const key of KEY_ORDER) {
        for (const position of CSNP_BITMASK_POSITIONS[key]) {
            if (mask.charAt(position - 1) === '1')
                filed.add(key);
        }
    }
    return canonical(filed);
}
export function truthy(value) {
    if (typeof value === 'boolean')
        return value;
    if (typeof value === 'number')
        return value !== 0;
    return typeof value === 'string' && /^(t|true|y|yes|1)$/i.test(value.trim());
}
export function filedConditionsFromBooleans(row) {
    const filed = new Set();
    if (truthy(row.cond_diabetes))
        filed.add('diabetes');
    if (truthy(row.cond_cardiovascular))
        filed.add('heart');
    if (truthy(row.cond_lung))
        filed.add('copd');
    if (truthy(row.cond_esrd))
        filed.add('esrd');
    return canonical(filed);
}
export function decodeSnpConditionRow(row) {
    if (!row)
        return { filed: [], source: 'none' };
    const fromMask = filedConditionsFromBitmask(row.snp_cond_bitmask);
    if (fromMask)
        return { filed: fromMask, source: 'bitmask' };
    const hasAnyBoolean = ['cond_cardiovascular', 'cond_diabetes', 'cond_esrd', 'cond_lung', 'cond_chronic_other']
        .some((column) => row[column] !== null && row[column] !== undefined);
    if (!hasAnyBoolean && (row.snp_type_code === null || row.snp_type_code === undefined)) {
        return { filed: [], source: 'none' };
    }
    return { filed: filedConditionsFromBooleans(row), source: 'booleans' };
}
export function decideCsnpAdmission({ requested, filed, isCurrentPlan, lookupFailed, }) {
    const requestedSet = new Set(requested);
    const served = filed ? canonical(filed.filed.filter((key) => requestedSet.has(key))) : [];
    if (lookupFailed) {
        return { keep: true, decision: 'lookup_failed', served: [], match: null };
    }
    if (served.length > 0) {
        return { keep: true, decision: isCurrentPlan ? 'current_plan_exempt' : 'matched', served, match: true };
    }
    if (isCurrentPlan) {
        return { keep: true, decision: 'current_plan_exempt', served: [], match: false };
    }
    if (requested.length === 0) {
        return { keep: false, decision: 'no_requested_keys', served: [], match: false };
    }
    if (!filed || filed.source === 'none' || filed.filed.length === 0) {
        return { keep: false, decision: 'no_filed_conditions', served: [], match: false };
    }
    return { keep: false, decision: 'unmatched', served: [], match: false };
}
export function normalizeSnpSegmentId(segment) {
    const text = String(segment ?? '0').trim();
    if (text === '')
        return '0';
    if (!/^\d+$/.test(text))
        return null;
    return String(Number.parseInt(text, 10));
}
