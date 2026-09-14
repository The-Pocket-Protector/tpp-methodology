export const MIN_RATIO_VS_PRIOR = 0.90;
export const CMS_HEADERS = {
    contract_id: 'Contract ID',
    plan_id: 'Plan ID',
    segment_id: 'Segment ID',
    state: 'State Territory Abbreviation',
    county: 'County Name',
    plan_name: 'Plan Name',
    org_name: 'Organization Marketing Name',
    plan_type: 'Plan Type',
    snp_indicator: 'Special Needs Plan (SNP) Indicator',
    snp_type: 'SNP Type',
    part_d_coverage: 'Part D Coverage Indicator',
    part_d_deductible: 'Annual Part D Deductible Amount',
    part_d_premium: 'Part D Total Premium',
    part_c_premium: 'Part C Premium',
    consolidated_premium: 'Monthly Consolidated Premium (Part C + D)',
    moop_in_network: 'In-Network Maximum Out-of-Pocket (MOOP) Amount',
    star_rating_part_c: 'Part C Summary Star Rating',
    star_rating_part_d: 'Part D Summary Star Rating',
    star_rating_overall: 'Overall Star Rating',
};
export const CONTRACT_YEAR_HEADER = 'Contract Year';
export const TARGET_COLUMNS = [...Object.keys(CMS_HEADERS), 'plan_year'];
export const PK_COLUMNS = ['contract_id', 'plan_id', 'segment_id', 'state', 'county', 'plan_year'];
export const UPDATE_COLUMNS = TARGET_COLUMNS.filter((c) => !PK_COLUMNS.includes(c));
export function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    let i = 0;
    if (text.charCodeAt(0) === 0xfeff)
        i = 1;
    for (; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                }
                else
                    inQuotes = false;
            }
            else
                field += ch;
            continue;
        }
        if (ch === '"') {
            inQuotes = true;
            continue;
        }
        if (ch === ',') {
            row.push(field);
            field = '';
            continue;
        }
        if (ch === '\r')
            continue;
        if (ch === '\n') {
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
            continue;
        }
        field += ch;
    }
    if (field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}
export function buildColumnMap(headerRow) {
    const byName = new Map();
    headerRow.forEach((h, idx) => {
        const key = h.trim();
        if (!byName.has(key))
            byName.set(key, idx);
    });
    const map = {};
    const missing = [];
    for (const [ourCol, cmsHeader] of Object.entries(CMS_HEADERS)) {
        if (!byName.has(cmsHeader))
            missing.push(`${ourCol} <- "${cmsHeader}"`);
        else
            map[ourCol] = byName.get(cmsHeader);
    }
    if (!byName.has(CONTRACT_YEAR_HEADER))
        missing.push(`(vintage) <- "${CONTRACT_YEAR_HEADER}"`);
    else
        map.__contract_year = byName.get(CONTRACT_YEAR_HEADER);
    if (missing.length) {
        throw new Error(`CMS header does not carry ${missing.length} required column(s):\n` +
            missing.map((m) => `    ${m}`).join('\n') +
            `\n  The file has ${headerRow.length} columns. CMS may have renamed a field for this ` +
            `edition — confirm against the file's ReadMe and update CMS_HEADERS deliberately. ` +
            `Never fall back to column position.`);
    }
    return map;
}
export function checkRowShape(rec) {
    if (!rec.contract_id)
        return 'empty contract_id';
    if (rec.state.length !== 2)
        return `state is not 2 chars: ${JSON.stringify(rec.state)}`;
    if (rec.plan_id.length !== 3)
        return `plan_id is not 3 chars: ${JSON.stringify(rec.plan_id)}`;
    if (!rec.segment_id)
        return 'empty segment_id';
    if (!rec.county)
        return 'empty county';
    if (/ County$/.test(rec.county))
        return `county carries a " County" suffix: ${JSON.stringify(rec.county)}`;
    return null;
}
export function stageFile(text, planYear) {
    const rows = parseCsv(text);
    if (rows.length === 0)
        throw new Error('File contains no rows at all (0 bytes of CSV?)');
    const header = rows[0];
    const map = buildColumnMap(header);
    const stats = {
        parsed: 0,
        accepted: 0,
        skipped: 0,
        skipReasons: {},
        duplicatePk: 0,
        duplicatePkConflicting: 0,
        vintageByYear: {},
    };
    const bad = [];
    const seen = new Map();
    const records = [];
    for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (row.length === 1 && row[0].trim() === '')
            continue;
        stats.parsed++;
        if (row.length < header.length) {
            stats.skipped++;
            stats.skipReasons.short_row = (stats.skipReasons.short_row || 0) + 1;
            continue;
        }
        const vintage = (row[map.__contract_year] ?? '').trim();
        stats.vintageByYear[vintage] = (stats.vintageByYear[vintage] || 0) + 1;
        const rec = {};
        for (const col of Object.keys(CMS_HEADERS)) {
            rec[col] = (row[map[col]] ?? '').trim();
        }
        rec.plan_year = planYear;
        const shapeErr = checkRowShape(rec);
        if (shapeErr) {
            if (bad.length < 10)
                bad.push(`line ${r + 1}: ${shapeErr}`);
            stats.skipped++;
            stats.skipReasons.bad_shape = (stats.skipReasons.bad_shape || 0) + 1;
            continue;
        }
        const pk = PK_COLUMNS.map((c) => rec[c]).join('\x00');
        const payload = UPDATE_COLUMNS.map((c) => rec[c]).join('\x00');
        if (seen.has(pk)) {
            stats.duplicatePk++;
            if (seen.get(pk) !== payload) {
                stats.duplicatePkConflicting++;
                if (bad.length < 10)
                    bad.push(`line ${r + 1}: duplicate PK with conflicting values: ${pk.replace(/\x00/g, '/')}`);
            }
            continue;
        }
        seen.set(pk, payload);
        records.push(rec);
        stats.accepted++;
    }
    const years = Object.keys(stats.vintageByYear);
    const wrongYear = years.filter((y) => y !== String(planYear));
    if (wrongYear.length) {
        throw new Error(`VINTAGE MISMATCH — the file's own "${CONTRACT_YEAR_HEADER}" disagrees with --plan-year=${planYear}.\n` +
            `  Observed: ${JSON.stringify(stats.vintageByYear)}\n` +
            `  This is the guard against labelling one lineup as another. If CMS genuinely ships a ` +
            `mixed-vintage file, that is a finding for a human, not something to load.`);
    }
    if (stats.skipReasons.bad_shape) {
        throw new Error(`HALT: ${stats.skipReasons.bad_shape} row(s) failed PK shape validation.\n` +
            bad.map((b) => `    ${b}`).join('\n') +
            `\n  Prod and the CY2026 file both hold zero violations of these rules, so this means the ` +
            `source shape changed. A partial landscape silently narrows which plans members can see, ` +
            `so this halts rather than skipping.`);
    }
    if (stats.duplicatePkConflicting) {
        throw new Error(`HALT: ${stats.duplicatePkConflicting} duplicate PK(s) carry CONFLICTING values.\n` +
            bad.map((b) => `    ${b}`).join('\n') +
            `\n  Which row is correct is not decidable here. Resolve against the CMS file before loading.`);
    }
    if (stats.accepted === 0) {
        throw new Error(`HALT: zero rows accepted from a file with ${stats.parsed} parsed data row(s). ` +
            `A zero-row load would leave the ${planYear} lineup empty and every plan surface blank.`);
    }
    return { records, stats };
}
export function checkGuard(accepted, priorCountForYear) {
    if (priorCountForYear === 0)
        return { ok: true, reason: 'new lineup — no prior rows to compare' };
    const floor = Math.floor(priorCountForYear * MIN_RATIO_VS_PRIOR);
    if (accepted < floor) {
        return {
            ok: false,
            reason: `${accepted.toLocaleString()} accepted rows is below the floor of ${floor.toLocaleString()} ` +
                `(${Math.round(MIN_RATIO_VS_PRIOR * 100)}% of the ${priorCountForYear.toLocaleString()} rows ` +
                `already serving this lineup). A truncated download looks exactly like this.`,
        };
    }
    return { ok: true, floor };
}
