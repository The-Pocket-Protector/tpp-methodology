export const PRICE_MIN = 10;
export const PRICE_MAX = 50000;
export const EXPECTED_IPAY_FAMILY_TOKENS = {
    2026: ['ELIQUIS', 'ENBREL', 'ENTRESTO', 'FARXIGA', 'IMBRUVICA', 'JANUVIA', 'JARDIANCE', 'NOVOLOG', 'STELARA', 'XARELTO'],
    2027: ['AUSTEDO', 'BREO', 'CALQUENCE', 'IBRANCE', 'JANUMET', 'LINZESS', 'OFEV', 'OTEZLA', 'OZEMPIC', 'POMALYST', 'TRADJENTA', 'TRELEGY', 'VRAYLAR', 'XIFAXAN', 'XTANDI'],
};
export const CROSSWALK_REL_PRIORITY = { self: 0, ingredient: 1, multiple_ingredients: 2, brand_name: 3 };
export function parseCsvLine(line) {
    const result = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuote) {
            if (ch === '"' && line[i + 1] === '"') {
                cur += '"';
                i++;
            }
            else if (ch === '"') {
                inQuote = false;
            }
            else {
                cur += ch;
            }
        }
        else {
            if (ch === '"') {
                inQuote = true;
            }
            else if (ch === ',') {
                result.push(cur);
                cur = '';
            }
            else {
                cur += ch;
            }
        }
    }
    result.push(cur);
    return result;
}
export function buildColIdx(headerFields) {
    const idx = {};
    headerFields.forEach((h, i) => { idx[h.toUpperCase().trim()] = i; });
    return idx;
}
export function parseMfpDate(raw) {
    if (raw == null)
        return null;
    const trimmed = String(raw).trim();
    if (trimmed === '')
        return null;
    const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m)
        return undefined;
    const mm = m[1].padStart(2, '0');
    const dd = m[2].padStart(2, '0');
    const yyyy = m[3];
    const mi = parseInt(mm, 10), di = parseInt(dd, 10);
    if (mi < 1 || mi > 12 || di < 1 || di > 31)
        return undefined;
    return `${yyyy}-${mm}-${dd}`;
}
export function parseNumericOrNull(raw) {
    if (raw == null)
        return null;
    const trimmed = String(raw).trim();
    if (trimmed === '')
        return null;
    if (!/^-?\d*\.?\d+$/.test(trimmed))
        return undefined;
    const n = parseFloat(trimmed);
    return Number.isFinite(n) ? n : undefined;
}
export function normalizeNdc11(raw) {
    if (raw == null)
        return '';
    return String(raw).replace(/[^0-9]/g, '');
}
export function deriveNdc9(ndc11) {
    return ndc11.slice(0, 9);
}
export function transformRow(fields, colIdx) {
    const get = (name) => {
        const i = colIdx[name.toUpperCase()];
        if (i === undefined)
            return '';
        return (fields[i] ?? '').trim();
    };
    const ndc11 = normalizeNdc11(get('NDC-11'));
    if (!ndc11)
        return { error: 'blank_ndc11' };
    if (!/^[0-9]{11}$/.test(ndc11))
        return { error: `bad_ndc11_format: "${get('NDC-11')}"` };
    const ndc9 = deriveNdc9(ndc11);
    const drugName = get('Selected Drug Name');
    if (!drugName)
        return { error: `blank_drug_name (ndc11=${ndc11})` };
    const ipayRaw = get('IPAY');
    const ipayYear = /^\d{4}$/.test(ipayRaw) ? parseInt(ipayRaw, 10) : null;
    if (ipayYear === null)
        return { error: `bad_ipay_year: "${ipayRaw}" (ndc11=${ndc11})` };
    const effFrom = parseMfpDate(get('MFP Effective Date'));
    if (effFrom === undefined)
        return { error: `bad_effective_date: "${get('MFP Effective Date')}" (ndc11=${ndc11})` };
    if (effFrom === null)
        return { error: `blank_effective_date (ndc11=${ndc11})` };
    const effTo = parseMfpDate(get('MFP End Date'));
    if (effTo === undefined)
        return { error: `bad_end_date: "${get('MFP End Date')}" (ndc11=${ndc11})` };
    const supply30 = parseNumericOrNull(get('Single MFP per 30 DES'));
    if (supply30 === undefined)
        return { error: `non_numeric_30day_price: "${get('Single MFP per 30 DES')}" (ndc11=${ndc11})` };
    const unitPrice = parseNumericOrNull(get('NDC-9 MFP per Unit Price'));
    if (unitPrice === undefined)
        return { error: `non_numeric_unit_price: "${get('NDC-9 MFP per Unit Price')}" (ndc11=${ndc11})` };
    const hcpcsDosePrice = parseNumericOrNull(get('HCPCS Code Dosage Price'));
    if (hcpcsDosePrice === undefined)
        return { error: `non_numeric_hcpcs_dose_price: "${get('HCPCS Code Dosage Price')}" (ndc11=${ndc11})` };
    let asOfDate = parseMfpDate(get('As of Date'));
    if (asOfDate === undefined)
        asOfDate = null;
    return {
        row: {
            ndc11,
            ndc9,
            drug_name: drugName,
            active_ingredient: get('Active Ingredient Name or Active Moiety Name') || null,
            manufacturer: null,
            hcpcs_code: get('HCPCS Code') || null,
            ipay_year: ipayYear,
            price_applicability_from: effFrom,
            price_applicability_to: effTo,
            mfp_30day_supply: supply30,
            mfp_per_unit_ndc9: unitPrice,
            mfp_per_package_ndc11: null,
            mfp_per_hcpcs_dose: hcpcsDosePrice,
            update_type: get('Type of Update') || null,
            source_as_of_date: asOfDate,
            remarks: get('Remarks') || null,
            status: 'active',
        },
    };
}
export function dedupeDuplicateEffectiveRows(rows) {
    const groups = new Map();
    for (const r of rows) {
        const key = `${r.ndc11}|${r.price_applicability_from}`;
        if (!groups.has(key))
            groups.set(key, []);
        groups.get(key).push(r);
    }
    const deduped = [];
    const collisions = [];
    const endDateRank = (r) => (r.price_applicability_to == null ? Infinity : Date.parse(r.price_applicability_to));
    for (const [key, group] of groups) {
        if (group.length === 1) {
            deduped.push(group[0]);
            continue;
        }
        let kept = group[0];
        for (const r of group.slice(1)) {
            if (endDateRank(r) >= endDateRank(kept))
                kept = r;
        }
        deduped.push(kept);
        collisions.push({
            key,
            kept: { update_type: kept.update_type, price_applicability_to: kept.price_applicability_to },
            dropped: group.filter((r) => r !== kept).map((r) => ({ update_type: r.update_type, price_applicability_to: r.price_applicability_to })),
        });
    }
    return { deduped, collisions };
}
export function findDuplicateKeys(rows) {
    const seen = new Map();
    const dups = [];
    for (const r of rows) {
        const key = `${r.ndc11}|${r.price_applicability_from}`;
        if (seen.has(key))
            dups.push(key);
        else
            seen.set(key, true);
    }
    return [...new Set(dups)];
}
export function validatePriceRange(rows, { min = PRICE_MIN, max = PRICE_MAX } = {}) {
    const problems = [];
    for (const r of rows) {
        if (r.mfp_30day_supply == null)
            continue;
        if (r.mfp_30day_supply < min || r.mfp_30day_supply > max) {
            problems.push(`${r.drug_name} (ndc11=${r.ndc11}, ipay=${r.ipay_year}): mfp_30day_supply=${r.mfp_30day_supply} outside [$${min}, $${max}]`);
        }
    }
    return problems;
}
export function validateDrugFamilyCounts(rows, expected = EXPECTED_IPAY_FAMILY_TOKENS) {
    const problems = [];
    for (const [yearStr, tokens] of Object.entries(expected)) {
        const year = parseInt(yearStr, 10);
        const namesForYear = [...new Set(rows.filter((r) => r.ipay_year === year).map((r) => r.drug_name))];
        if (namesForYear.length !== tokens.length) {
            problems.push(`IPAY ${year}: expected ${tokens.length} drug families, found ${namesForYear.length} (${namesForYear.join(' | ')})`);
            continue;
        }
        const upper = namesForYear.map((n) => n.toUpperCase());
        const missing = tokens.filter((tok) => !upper.some((n) => n.includes(tok)));
        if (missing.length > 0) {
            problems.push(`IPAY ${year}: missing expected drug family token(s): ${missing.join(', ')} (found: ${namesForYear.join(' | ')})`);
        }
    }
    return problems;
}
export function pickBestCrosswalk(rows) {
    const best = new Map();
    for (const r of rows) {
        const cur = best.get(r.external_rxcui);
        const pr = CROSSWALK_REL_PRIORITY[r.relation_type] ?? 4;
        if (!cur || pr < (CROSSWALK_REL_PRIORITY[cur.relation_type] ?? 4))
            best.set(r.external_rxcui, r);
    }
    return best;
}
export function buildRemovedMarkerRows(priorActiveRows, currentNdcSet, fileReleaseDate) {
    return priorActiveRows
        .filter((p) => !currentNdcSet.has(p.ndc11))
        .map((p) => ({
        ndc11: p.ndc11,
        ndc9: p.ndc9,
        drug_name: p.drug_name,
        active_ingredient: p.active_ingredient ?? null,
        manufacturer: null,
        hcpcs_code: null,
        ipay_year: p.ipay_year,
        price_applicability_from: fileReleaseDate,
        price_applicability_to: null,
        mfp_30day_supply: null,
        mfp_per_unit_ndc9: null,
        mfp_per_package_ndc11: null,
        mfp_per_hcpcs_dose: null,
        update_type: 'removed_by_loader',
        source_as_of_date: fileReleaseDate,
        remarks: 'NDC present in a prior release but absent from the current CMS file; marked removed by the loader.',
        status: 'removed',
        rxcui: p.rxcui ?? null,
    }));
}
