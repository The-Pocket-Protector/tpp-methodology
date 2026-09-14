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
export function parseEffectiveDate(raw) {
    if (!raw)
        return null;
    const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m)
        return null;
    const mm = m[1].padStart(2, '0');
    const dd = m[2].padStart(2, '0');
    const yyyy = m[3];
    const mi = parseInt(mm, 10), di = parseInt(dd, 10);
    if (mi < 1 || mi > 12 || di < 1 || di > 31)
        return null;
    return `${yyyy}-${mm}-${dd}`;
}
export function transformRow(fields, colIdx) {
    const get = (name) => {
        const i = colIdx[name.toUpperCase()];
        if (i === undefined)
            return '';
        return (fields[i] ?? '').trim();
    };
    const ndc = get('NDC');
    if (!ndc)
        return { skip: 'blank_ndc' };
    const nadacRaw = get('NADAC Per Unit');
    if (nadacRaw === '' || !/^-?\d*\.?\d+$/.test(nadacRaw))
        return { skip: 'non_numeric_nadac' };
    const nadac = parseFloat(nadacRaw);
    if (!Number.isFinite(nadac))
        return { skip: 'non_numeric_nadac' };
    const effective = parseEffectiveDate(get('Effective Date'));
    if (!effective)
        return { skip: 'bad_effective_date' };
    return {
        row: {
            ndc,
            drug_name: get('NDC Description') || null,
            nadac_per_unit: nadac,
            pricing_unit: get('Pricing Unit') || null,
            effective_date: effective,
            otc: get('OTC') || null,
            classification: get('Classification for Rate Setting') || null,
        },
    };
}
