export function prescriptionComparisonExclusion(classification) {
    return classification === 'otc' || classification === 'dietary_supplement' ? classification : undefined;
}
