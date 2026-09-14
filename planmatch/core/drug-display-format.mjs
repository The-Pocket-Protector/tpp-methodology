import { sumDoseTokens } from './drug-dosage.mjs';
export const FORM_WORDS = [
    'tablet', 'tablets', 'capsule', 'capsules', 'solution', 'suspension',
    'liquid', 'syrup', 'elixir', 'powder', 'injection', 'cream', 'ointment',
    'gel', 'lotion', 'patch', 'spray', 'drops', 'foam', 'aerosol',
    'suppository', 'kit', 'pack', 'film', 'wafer', 'strip', 'strips',
    'enema', 'sponge', 'disc', 'disks',
];
export const ORAL_BEFORE_FORM_RE = new RegExp(`\\bOral\\s+(?=(?:${FORM_WORDS.join('|')})s?\\b)`, 'gi');
export const UNIT_AFTER_NUMBER_RE = /(\d(?:[.,]\d+)?)\s*(MG|MCG|ML|MEQ|UNITS?)\b/gi;
export const UNIT_AFTER_SLASH_RE = /\/\s*(MG|MCG|ML|MEQ|UNITS?)\b/gi;
export const FIRST_DIGIT_RE = /\b\d/;
export const LEADING_HR_PREFIX_RE = /^\d+\s*HR\s+/i;
export const PACK_CONTAINER_RE = /^\s*\{[\s\S]+\}\s*Pack\s*$/i;
export const PACK_GROUP_RE = /\(([^()]*)\)/g;
export const LEADING_VOLUME_RE = /^\d+(?:[.,]\d+)?\s*ML\s+/i;
export const INGREDIENT_BEFORE_DOSE_RE = /^([A-Za-z][A-Za-z\-'’ ]*?)\s+\d/;
export function extractPackIngredient(segment) {
    const seg = segment.trim().replace(LEADING_VOLUME_RE, '');
    const m = seg.match(INGREDIENT_BEFORE_DOSE_RE);
    if (!m)
        return null;
    const name = titleCasePhrase(m[1].trim());
    if (/^inert ingredients$/i.test(name))
        return null;
    return name;
}
export function derivePackDisplayName(container) {
    const names = [];
    const seen = new Set();
    let g;
    PACK_GROUP_RE.lastIndex = 0;
    while ((g = PACK_GROUP_RE.exec(container)) !== null) {
        for (const seg of g[1].split('/')) {
            const name = extractPackIngredient(seg);
            if (!name)
                continue;
            const key = name.toLowerCase();
            if (seen.has(key))
                continue;
            seen.add(key);
            names.push(name);
        }
    }
    if (names.length)
        return `${names.join(' / ')} Pack`;
    const body = container.replace(/^\s*\{/, '').replace(/\}\s*Pack\s*$/i, '').trim();
    return titleCasePhrase(body).replace(/\s+/g, ' ').trim() || 'Pack';
}
export const AS_PREFIX_FOLD_RE = /^([A-Za-z][A-Za-z\- ]*?)\s+\(as\s+([^)]+)\)\s+/i;
export const PARENTHETICAL_DISQUALIFIER_RE = /\d|[\/%]|\b(MG|MCG|ML|MEQ|UNTS?|UNITS?|PE|equivalent)\b/i;
export const DOSE_TUPLE_RE = /(\d+(?:[.,]\d+)?)\s*(mg|mcg|ml|meq|units?)\b/gi;
export const TRAILING_FORM_RE = new RegExp(`\\b((?:Extended\\s+Release\\s+)?(?:${FORM_WORDS.join('|')})s?)\\s*$`, 'i');
export function tryCollapseNIngredientCombo(brand, body) {
    if (!brand)
        return null;
    const slashCount = (body.match(/\//g) || []).length;
    if (slashCount < 2)
        return null;
    const tokens = [];
    let m;
    DOSE_TUPLE_RE.lastIndex = 0;
    while ((m = DOSE_TUPLE_RE.exec(body)) !== null) {
        const num = parseFloat(m[1].replace(',', '.'));
        if (!Number.isFinite(num))
            continue;
        tokens.push({ num, unit: m[2].toLowerCase() });
    }
    if (tokens.length < 3)
        return null;
    const first = tokens[0];
    if (!tokens.every((t) => t.num === first.num && t.unit === first.unit))
        return null;
    const perUnit = sumDoseTokens(tokens);
    if (perUnit.size !== 1)
        return null;
    const formMatch = body.match(TRAILING_FORM_RE);
    if (!formMatch)
        return null;
    const form = titleCasePhrase(formMatch[1].toLowerCase());
    const [unit, total] = [...perUnit][0];
    return `${brand} ${total} ${unit} ${form}`.replace(/\s+/g, ' ').trim();
}
export function foldAsSaltPrefix(s) {
    const m = AS_PREFIX_FOLD_RE.exec(s);
    if (!m)
        return s;
    const base = m[1].trim();
    const inner = m[2].trim();
    const baseLc = base.toLowerCase();
    const innerLc = inner.toLowerCase();
    const prefixMatch = innerLc === baseLc ||
        innerLc.startsWith(baseLc + ' ') ||
        innerLc.startsWith(baseLc + '-');
    if (!prefixMatch)
        return s;
    if (PARENTHETICAL_DISQUALIFIER_RE.test(inner))
        return s;
    return inner + ' ' + s.slice(m[0].length);
}
export function titleCaseWord(word) {
    if (!word)
        return word;
    return word
        .split('-')
        .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part))
        .join('-');
}
export function titleCasePhrase(phrase) {
    return phrase
        .split(/(\s+)/)
        .map((tok) => (/^\s+$/.test(tok) ? tok : titleCaseWord(tok)))
        .join('');
}
export function formatDrugDisplayName(rawName) {
    if (rawName == null)
        return '';
    let s = String(rawName).trim();
    if (!s)
        return '';
    let brand = null;
    const bracketMatch = s.match(/\s*\[([^\]]+)\]\s*$/);
    if (bracketMatch) {
        brand = bracketMatch[1].trim();
        s = s.slice(0, bracketMatch.index).trim();
    }
    if (PACK_CONTAINER_RE.test(s)) {
        return brand
            ? brand.replace(/\s+/g, ' ').trim()
            : derivePackDisplayName(s);
    }
    s = s.replace(LEADING_HR_PREFIX_RE, '');
    s = foldAsSaltPrefix(s);
    s = s.replace(UNIT_AFTER_NUMBER_RE, (_, num, unit) => `${num} ${unit.toLowerCase()}`);
    s = s.replace(UNIT_AFTER_SLASH_RE, (_, unit) => `/${unit.toLowerCase()}`);
    s = s.replace(ORAL_BEFORE_FORM_RE, '').trim();
    const collapsed = tryCollapseNIngredientCombo(brand, s);
    if (collapsed)
        return collapsed;
    const dosageIdx = s.search(FIRST_DIGIT_RE);
    let namePart;
    let restPart;
    if (dosageIdx === -1) {
        namePart = s;
        restPart = '';
    }
    else {
        namePart = s.slice(0, dosageIdx).trim();
        restPart = s.slice(dosageIdx).trim();
    }
    const leadName = brand || titleCasePhrase(namePart);
    let restTitled = titleCasePhrase(restPart);
    restTitled = restTitled.replace(UNIT_AFTER_NUMBER_RE, (_, num, unit) => `${num} ${unit.toLowerCase()}`);
    restTitled = restTitled.replace(UNIT_AFTER_SLASH_RE, (_, unit) => `/${unit.toLowerCase()}`);
    return [leadName, restTitled].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}
