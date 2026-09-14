export function sumDoseTokens(tokens) {
    const perUnit = new Map();
    if (!Array.isArray(tokens))
        return perUnit;
    for (const { num, unit } of tokens) {
        if (!Number.isFinite(num))
            continue;
        perUnit.set(unit, (perUnit.get(unit) || 0) + num);
    }
    for (const [unit, total] of perUnit) {
        perUnit.set(unit, Number(Math.round((total + Number.EPSILON) * 10000) / 10000));
    }
    return perUnit;
}
