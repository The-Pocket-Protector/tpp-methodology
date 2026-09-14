export const COL = {
    NPI: 1,
    ENTITY_TYPE: 2,
    ORG_NAME: 5,
    LAST_NAME: 6,
    FIRST_NAME: 7,
    CREDENTIAL: 11,
    PL_ADDR1: 29,
    PL_ADDR2: 30,
    PL_CITY: 31,
    PL_STATE: 32,
    PL_ZIP: 33,
    PL_COUNTRY: 34,
    PL_PHONE: 35,
    ENUMERATION_DATE: 37,
    LAST_UPDATE: 38,
    DEACT_REASON: 39,
    DEACT_DATE: 40,
    REACT_DATE: 41,
    GENDER: 42,
    SOLE_PROPRIETOR: 308,
};
export const TAXONOMY_SLOTS = [
    [48, 51], [52, 55], [56, 59], [60, 63], [64, 67],
    [68, 71], [72, 75], [76, 79], [80, 83],
    [84, 87], [88, 91], [92, 95], [96, 99], [100, 103], [104, 107],
];
export const EXPECTED_COLUMNS = 330;
export const at = (row, oneIndexed) => {
    const v = row[oneIndexed - 1];
    if (v === undefined)
        return null;
    const t = v.trim();
    return t === '' ? null : t;
};
export function transformRow(row) {
    if (row.length !== EXPECTED_COLUMNS) {
        return { kind: 'skip', reason: `column_count_${row.length}` };
    }
    const npi = at(row, COL.NPI);
    if (!npi || !/^\d{10}$/.test(npi))
        return { kind: 'skip', reason: 'bad_npi' };
    const entityType = at(row, COL.ENTITY_TYPE);
    const deactDate = at(row, COL.DEACT_DATE);
    const reactDate = at(row, COL.REACT_DATE);
    if (!entityType) {
        if (!deactDate)
            return { kind: 'skip', reason: 'blank_row_without_deactivation_date' };
        return { kind: 'deactivation', npi, deactivation_date: deactDate };
    }
    if (entityType !== '1' && entityType !== '2') {
        return { kind: 'skip', reason: `bad_entity_type_${entityType}` };
    }
    let taxonomy = null;
    let firstPopulated = null;
    for (const [codeCol, switchCol] of TAXONOMY_SLOTS) {
        const code = at(row, codeCol);
        if (!code)
            continue;
        if (firstPopulated === null)
            firstPopulated = code;
        if ((at(row, switchCol) || '').toUpperCase() === 'Y') {
            taxonomy = code;
            break;
        }
    }
    if (taxonomy === null)
        taxonomy = firstPopulated;
    const country = at(row, COL.PL_COUNTRY);
    return {
        kind: reactDate ? 'reactivation' : 'normal',
        npi,
        entity_type: entityType,
        provider_organization_name: at(row, COL.ORG_NAME),
        provider_last_name: at(row, COL.LAST_NAME),
        provider_first_name: at(row, COL.FIRST_NAME),
        provider_credential: at(row, COL.CREDENTIAL),
        provider_gender: at(row, COL.GENDER),
        provider_taxonomy_1: taxonomy,
        provider_taxonomy_desc_1: null,
        address_line1: at(row, COL.PL_ADDR1),
        address_line2: at(row, COL.PL_ADDR2),
        city: at(row, COL.PL_CITY),
        state: at(row, COL.PL_STATE),
        zip: at(row, COL.PL_ZIP),
        phone: at(row, COL.PL_PHONE),
        enumeration_date: at(row, COL.ENUMERATION_DATE),
        last_update: at(row, COL.LAST_UPDATE),
        deactivation_date: deactDate,
        deactivation_reason: at(row, COL.DEACT_REASON),
        reactivation_date: reactDate,
        is_sole_proprietor: at(row, COL.SOLE_PROPRIETOR),
        is_us_provider: country === null || country === 'US',
    };
}
