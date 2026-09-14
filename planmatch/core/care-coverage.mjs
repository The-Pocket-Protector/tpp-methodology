export function coveredDoctorCount(plan) {
    return (Number(plan.doctors_in_network) || 0)
        + (Number(plan.doctors_likely_in_network) || 0)
        + (Number(plan.doctors_covered_via_cross_reference) || 0);
}
export function confirmedDoctorCount(plan) {
    return Number(plan.doctors_in_network) || 0;
}
export function doctorCoverageStatus(doctorsInNetwork, totalDoctors) {
    if (totalDoctors === 0)
        return 'not_applicable';
    if (doctorsInNetwork === totalDoctors)
        return 'all_covered';
    if (doctorsInNetwork > 0)
        return 'partially_covered';
    return 'not_covered';
}
export function buildCareMatchMessage(mode, totalDoctors, totalDrugs, confirmationDecidedTier = false, everyDoctorConfirmed = true) {
    if (mode === 'not_applicable')
        return null;
    if (mode === 'perfect') {
        if (!everyDoctorConfirmed && totalDoctors > 0 && totalDrugs > 0) {
            return 'These plans list all of your doctors and cover your entered medications. Call the plan to confirm before you enroll.';
        }
        if (!everyDoctorConfirmed && totalDoctors > 0) {
            return 'These plans list all of your doctors. Call the plan to confirm before you enroll.';
        }
        if (totalDoctors > 0 && totalDrugs > 0)
            return 'These plans cover your entered doctors and medications.';
        if (totalDoctors > 0)
            return 'These plans cover your entered doctors.';
        return 'These plans cover your entered medications.';
    }
    if (mode === 'best_available') {
        if (confirmationDecidedTier && totalDoctors > 0 && totalDrugs > 0) {
            return "We couldn't find one plan that includes all of your doctors and medications. These plans confirm at least one of your doctors is in network.";
        }
        if (confirmationDecidedTier && totalDoctors > 0) {
            return "We couldn't find one plan that includes all of your doctors. These plans confirm at least one of them is in network.";
        }
        if (totalDoctors > 0 && totalDrugs > 0)
            return 'No plan covered everything. Showing plans with the best available doctor and drug match.';
        if (totalDoctors > 0)
            return 'No plan covered all entered doctors. Showing plans with the best available doctor match.';
        return 'No plan covered all entered medications. Showing plans with the best available medication match.';
    }
    return 'We could not confirm your entered doctors or medications in available plans. Showing the best plans by cost and benefits.';
}
export function selectCareMatchTier(plans, totalDoctors, totalDrugs) {
    const careInputsPresent = totalDoctors > 0 || totalDrugs > 0;
    if (!careInputsPresent) {
        return {
            plans: [...plans],
            metadata: {
                care_match_mode: 'not_applicable',
                care_match_doctors_required: 0,
                care_match_doctors_returned: 0,
                care_match_drugs_required: 0,
                care_match_drugs_returned: 0,
                care_match_message: null,
            },
        };
    }
    const perfectPlans = plans.filter((plan) => {
        const doctorsCovered = totalDoctors === 0 || coveredDoctorCount(plan) === totalDoctors;
        const drugsCovered = totalDrugs === 0 || plan.drugs_covered === totalDrugs;
        return doctorsCovered && drugsCovered;
    });
    if (perfectPlans.length > 0) {
        const crossReferenceUsed = perfectPlans.some((plan) => (Number(plan.doctors_covered_via_cross_reference) || 0) > 0);
        const everyDoctorConfirmed = totalDoctors === 0
            || perfectPlans.every((plan) => confirmedDoctorCount(plan) === totalDoctors);
        return {
            plans: [...perfectPlans],
            metadata: {
                care_match_mode: 'perfect',
                care_match_doctors_required: totalDoctors,
                care_match_doctors_returned: totalDoctors,
                care_match_drugs_required: totalDrugs,
                care_match_drugs_returned: totalDrugs,
                care_match_message: crossReferenceUsed
                    ? null
                    : buildCareMatchMessage('perfect', totalDoctors, totalDrugs, false, everyDoctorConfirmed),
            },
        };
    }
    let tierPlans = plans;
    let returnedDoctors = 0;
    let confirmationDecidedTier = false;
    if (totalDoctors > 0) {
        const maxConfirmedDoctors = Math.max(0, ...plans.map(confirmedDoctorCount));
        if (maxConfirmedDoctors > 0) {
            confirmationDecidedTier = true;
            tierPlans = tierPlans.filter((plan) => confirmedDoctorCount(plan) === maxConfirmedDoctors);
        }
        returnedDoctors = Math.max(0, ...tierPlans.map(coveredDoctorCount));
        tierPlans = tierPlans.filter((plan) => coveredDoctorCount(plan) === returnedDoctors);
    }
    let returnedDrugs = 0;
    if (totalDrugs > 0) {
        returnedDrugs = Math.max(0, ...tierPlans.map((plan) => Number(plan.drugs_covered) || 0));
        tierPlans = tierPlans.filter((plan) => (Number(plan.drugs_covered) || 0) === returnedDrugs);
    }
    const mode = returnedDoctors === 0 && returnedDrugs === 0 ? 'no_confirmed_match' : 'best_available';
    return {
        plans: [...tierPlans],
        metadata: {
            care_match_mode: mode,
            care_match_doctors_required: totalDoctors,
            care_match_doctors_returned: returnedDoctors,
            care_match_drugs_required: totalDrugs,
            care_match_drugs_returned: returnedDrugs,
            care_match_message: buildCareMatchMessage(mode, totalDoctors, totalDrugs, confirmationDecidedTier),
        },
    };
}
