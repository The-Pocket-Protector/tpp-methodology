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
