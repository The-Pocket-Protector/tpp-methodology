type PartBGiveback = number | {
    amount?: unknown;
    monthly_savings?: unknown;
} | null | undefined;

export type MaPlanValueInput = {
    monthly_premium?: unknown;
    part_b_giveback?: PartBGiveback;
    annual_cost?: unknown;
    estimated_annual_drug_cost?: unknown;
    moop?: unknown;
    moop_in_network?: unknown;
} & Record<string, unknown>;

export type MaPlanValueContext = {
    hasMedicaid?: boolean;
} & Record<string, unknown>;

function numberValue(value: unknown): number | null {
    if (value === null || value === undefined || value === '')
        return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

export function roundMoney(value: number): number {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : value;
}

export function getMonthlyPremiumValue(plan: MaPlanValueInput): number {
    const premium = numberValue(plan?.monthly_premium);
    return premium !== null && premium > 0 ? premium : 0;
}

export function getPartBGivebackValue(plan: MaPlanValueInput, context: MaPlanValueContext = {}): number {
    if (context?.hasMedicaid === true)
        return 0;
    const rawGiveback = plan?.part_b_giveback;
    const rawAmount = typeof rawGiveback === 'number'
        ? rawGiveback
        : rawGiveback?.amount ?? rawGiveback?.monthly_savings;
    const amount = numberValue(rawAmount);
    return amount !== null && amount > 0 ? amount : 0;
}

export function getEffectiveMonthlyPremiumValue(plan: MaPlanValueInput, context: MaPlanValueContext = {}): number {
    return roundMoney(getMonthlyPremiumValue(plan) - getPartBGivebackValue(plan, context));
}
