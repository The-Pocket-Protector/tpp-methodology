type RawDrugRow = {
    is_generic?: unknown;
    tty?: string | null;
    ingredient_rxcui?: string | null;
    ingredient_name?: string | null;
    sibling_rxcuis?: string[] | null;
    is_pack?: boolean | null;
    generic_alternative?: unknown;
} & Record<string, unknown>;

type RawDrugSearchResponse = {
    drugs?: RawDrugRow[] | null;
    ungrouped?: RawDrugRow[] | null;
} & Record<string, unknown>;

export function normalizeDrugGenericFlag(value: unknown): boolean | null {
    if (value === true || value === 1)
        return true;
    if (value === false || value === 0)
        return false;
    if (value == null)
        return null;
    const normalized = String(value).trim().toLowerCase();
    if (!normalized)
        return null;
    if (['1', 'true', 't', 'y', 'yes', 'generic'].includes(normalized))
        return true;
    if (['0', 'false', 'f', 'n', 'no', 'brand'].includes(normalized))
        return false;
    return null;
}

export function normalizeDrugSearchResponseV2<T extends RawDrugSearchResponse>(response: T) {
    return {
        ...response,
        contract_version: 'v2' as const,
        drugs: (response.drugs || []).map((drug) => ({
            ...drug,
            is_generic: normalizeDrugGenericFlag(drug.is_generic),
        })),
        ungrouped: (response.ungrouped || []).map((drug) => ({
            ...drug,
            is_generic: normalizeDrugGenericFlag(drug.is_generic),
        })),
    };
}

export function normalizeDrugSearchResponseV3<T extends RawDrugSearchResponse>(response: T) {
    return {
        ...response,
        contract_version: 'v3' as const,
        drugs: (response.drugs || []).map((drug) => ({
            ...drug,
            is_generic: normalizeDrugGenericFlag(drug.is_generic),
            tty: drug.tty || null,
            ingredient_rxcui: drug.ingredient_rxcui || null,
            ingredient_name: drug.ingredient_name || null,
            sibling_rxcuis: drug.sibling_rxcuis || [],
            is_pack: drug.is_pack || false,
            generic_alternative: drug.generic_alternative || null,
        })),
        ungrouped: (response.ungrouped || []).map((drug) => ({
            ...drug,
            is_generic: normalizeDrugGenericFlag(drug.is_generic),
        })),
    };
}
