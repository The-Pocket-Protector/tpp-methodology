import type { DoctorBand, PharmacyNetworkStatus } from './types.mts';

export type RankablePlan = {
    plan_type: 'mapd' | 'pdp';
    pharmacy: {
        status: PharmacyNetworkStatus;
    };
    doctor_band: DoctorBand | null;
    drugs_covered: number;
    drugs_total: number;
    estimated_annual_total_cost: number | null;
    annual_cost_estimable: boolean;
};

const DOCTOR_BAND_ORDER: Record<DoctorBand, number> = {
    all_kept: 0,
    unknown: 1,
    some_lost: 2,
};

function dataGapBand(plan: RankablePlan): number {
    return plan.pharmacy.status === 'data_gap' ? 1 : 0;
}

function doctorBandOrder(plan: RankablePlan): number {
    return plan.doctor_band == null ? 0 : DOCTOR_BAND_ORDER[plan.doctor_band];
}

function costOrder(a: RankablePlan, b: RankablePlan): number {
    const aEstimable = a.annual_cost_estimable && a.estimated_annual_total_cost != null;
    const bEstimable = b.annual_cost_estimable && b.estimated_annual_total_cost != null;
    if (aEstimable !== bEstimable)
        return aEstimable ? -1 : 1;
    if (!aEstimable)
        return 0;
    return (a.estimated_annual_total_cost as number) - (b.estimated_annual_total_cost as number);
}

export function rankPharmacySavingsPlans<T extends RankablePlan>(plans: T[]): T[] {
    return [...plans].sort((a, b) => (dataGapBand(a) - dataGapBand(b))
        || (doctorBandOrder(a) - doctorBandOrder(b))
        || (b.drugs_covered - a.drugs_covered)
        || costOrder(a, b));
}
