import { doctorCoverageStatus } from './care-coverage.mjs';
import { isProviderCoverageWeightEnabled } from './provider-coverage-weight-flag.mjs';
export function isCoveredViaCrossReference(detail) {
    return detail.cross_reference?.status === 'acknowledged';
}
export function computeProviderCoverageScore(providerDetails, totalDoctors) {
    if (!totalDoctors || totalDoctors <= 0)
        return null;
    const positives = (providerDetails || []).filter((d) => d.status === 'in_network' || d.status === 'likely_in_network' || isCoveredViaCrossReference(d));
    if (positives.length === 0)
        return null;
    let qualitySum = 0;
    for (const d of positives) {
        if (isCoveredViaCrossReference(d))
            qualitySum += 0.7;
        else if (d.status === 'likely_in_network')
            qualitySum += 0.5;
        else if (d.office_verified === true)
            qualitySum += 1.0;
        else if (d.match_level === 'plan')
            qualitySum += 0.9;
        else
            qualitySum += 0.7;
    }
    const avgQuality = qualitySum / positives.length;
    const coverageRatio = Math.min(positives.length, totalDoctors) / totalDoctors;
    return Math.round(100 * coverageRatio * avgQuality);
}
export function buildProviderFacts({ planKey, providerScores, totalDoctors, }) {
    let doctorsInNetwork = 0;
    let doctorsLikelyInNetwork = 0;
    let doctorsCoveredViaCrossReference = 0;
    let doctorsCrossReferenceAvailable = 0;
    let doctorsUnknown = totalDoctors;
    let doctorRequirementsUnknown = totalDoctors;
    let doctorNetworkVerified = totalDoctors === 0 ? null : false;
    let providerDetails = [];
    let providerNote = null;
    const ps = providerScores.get(planKey);
    let doctorsOutOfNetwork = 0;
    if (totalDoctors > 0 && ps) {
        providerDetails = ps.details || [];
        if (ps.provider_score === null) {
            providerNote = ps.reason ?? null;
        }
        doctorsInNetwork = providerDetails.filter((d) => d.status === 'in_network').length;
        doctorsOutOfNetwork = providerDetails.filter((d) => d.status === 'out_of_network').length;
        doctorsLikelyInNetwork = providerDetails.filter((d) => d.status === 'likely_in_network' && !isCoveredViaCrossReference(d)).length;
        doctorsCoveredViaCrossReference = providerDetails.filter(isCoveredViaCrossReference).length;
        doctorsCrossReferenceAvailable = providerDetails.filter((d) => d.cross_reference?.status === 'available').length;
        doctorsUnknown = providerDetails.filter((d) => d.status === 'unable_to_verify' || d.status === 'unknown' || d.status === 'not_found').length;
        doctorRequirementsUnknown = providerDetails.filter((d) => !isCoveredViaCrossReference(d)
            && (d.status === 'unable_to_verify' || d.status === 'unknown' || d.status === 'not_found')).length;
        doctorNetworkVerified = providerDetails.length > 0 && providerDetails.every((d) => d.status === 'in_network' || d.status === 'out_of_network');
    }
    return {
        doctorsInNetwork,
        doctorsLikelyInNetwork,
        doctorsCoveredViaCrossReference,
        doctorsCrossReferenceAvailable,
        doctorsUnknown,
        doctorRequirementsUnknown,
        doctorNetworkVerified,
        providerDetails,
        providerNote,
        doctorsOutOfNetwork,
        doctorCoverageStatus: doctorCoverageStatus(doctorsInNetwork + doctorsLikelyInNetwork + doctorsCoveredViaCrossReference, totalDoctors),
        ...providerCoverageWeight(providerDetails, totalDoctors),
    };
}
export function providerCoverageWeight(providerDetails, totalDoctors) {
    const providerWeightOn = isProviderCoverageWeightEnabled();
    const providerCoverageScore = computeProviderCoverageScore(providerDetails, totalDoctors);
    const bonusMax = parseInt(process.env.PLANMATCH_PROVIDER_BONUS, 10) || 15;
    const providerBonus = (providerWeightOn && totalDoctors > 0 && providerCoverageScore != null)
        ? Math.round((providerCoverageScore / 100) * bonusMax)
        : 0;
    return { providerWeightOn, providerCoverageScore, providerBonus };
}
