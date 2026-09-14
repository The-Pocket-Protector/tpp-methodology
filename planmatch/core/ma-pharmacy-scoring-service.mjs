export function scorePharmacyNetwork({ planKey, pharmacyInput, pharmPref, pharmacyNetworkMap, }) {
    let pharmacyScore = 50;
    let pharmacyStatus = null;
    let pharmacyDispensingFees = null;
    let pharmacyMatchLevel = null;
    if (pharmacyInput && pharmacyInput.zip) {
        const pn = pharmacyNetworkMap.get(planKey);
        if (pn) {
            pharmacyDispensingFees = pn.dispensing_fees;
            pharmacyMatchLevel = pn.match_level ?? 'zip';
            if (pharmPref === 'mail_order') {
                if (pn.preferred_mail) {
                    pharmacyScore = 100;
                    pharmacyStatus = 'preferred_mail';
                }
                else if (pn.has_mail) {
                    pharmacyScore = 80;
                    pharmacyStatus = 'standard_mail';
                }
                else if (pn.has_retail) {
                    pharmacyScore = 40;
                    pharmacyStatus = 'retail_only';
                }
                else {
                    pharmacyScore = 10;
                    pharmacyStatus = 'not_in_network';
                }
            }
            else {
                if (pn.preferred_retail) {
                    pharmacyScore = 100;
                    pharmacyStatus = 'preferred_retail';
                }
                else if (pn.has_retail) {
                    pharmacyScore = 70;
                    pharmacyStatus = 'standard_retail';
                }
                else if (pn.has_mail) {
                    pharmacyScore = 50;
                    pharmacyStatus = 'mail_only';
                }
                else {
                    pharmacyScore = 10;
                    pharmacyStatus = 'not_in_network';
                }
            }
        }
        else {
            pharmacyScore = 10;
            pharmacyStatus = 'not_in_network';
            pharmacyMatchLevel = 'zip';
        }
    }
    return {
        pharmacyScore,
        pharmacyStatus,
        pharmacyDispensingFees,
        pharmacyMatchLevel,
    };
}
