export function calculateBaseScore({ premium, moop, minPremium, maxPremium, minMoop, maxMoop, weights, benefitsScore, pharmacyScore, providerBonus, hasPartD, p }) {
    let premiumScore = 50;
    if (premium !== null) {
        const relPremium = maxPremium > minPremium
            ? Math.round(100 - ((premium - minPremium) / (maxPremium - minPremium)) * 100)
            : (premium === 0 ? 100 : 50);
        const absPremium = Math.round(Math.max(0, Math.min(100, 100 - (premium / 2))));
        premiumScore = Math.round(relPremium * 0.6 + absPremium * 0.4);
    }
    else if (premium === 0) {
        premiumScore = 100;
    }
    let oopScore = 50;
    if (moop !== null) {
        const relOop = maxMoop > minMoop
            ? Math.round(100 - ((moop - minMoop) / (maxMoop - minMoop)) * 100)
            : 50;
        const absOop = Math.round(Math.max(0, Math.min(100, 100 - (moop / 110))));
        oopScore = Math.round(relOop * 0.6 + absOop * 0.4);
    }
    const csnpBonus = 0;
    let starBonus = 0;
    const STAR_MULTIPLIER = parseInt(process.env.PLANMATCH_STAR_MULT) || 1;
    const starStr = p.star_rating_overall;
    let starRating = null;
    if (starStr && starStr !== 'Not Enough Data Available') {
        const star = parseFloat(starStr);
        if (Number.isFinite(star)) {
            starRating = star;
            starBonus = Math.round((star - 3) * STAR_MULTIPLIER);
        }
    }
    const oonPenalty = 0;
    const PART_D_BONUS = parseInt(process.env.PLANMATCH_PARTD_BONUS) || 5;
    const partDBonus = (hasPartD === 'yes' || hasPartD === 'y') ? PART_D_BONUS : 0;
    const overall = Math.round((premiumScore * weights.premium +
        oopScore * weights.out_of_pocket +
        pharmacyScore * weights.pharmacy_network +
        benefitsScore * weights.benefits) / 100 + starBonus + csnpBonus + partDBonus - oonPenalty + providerBonus);
    return { overall, premiumScore, oopScore, starRating, starBonus, partDBonus, csnpBonus, oonPenalty };
}
