// The numbers behind "Din kupon": combined chance (the legs are on different
// matches, so they are treated as independent), combined odds and what
// 100 kr returns on average.

export interface CouponLeg {
  probability: number;
  odds: number | null;
}

export interface CouponMath {
  legs: number;
  probability: number;
  /** Combined odds over the legs that have odds; null when none have. */
  odds: number | null;
  /** Legs without bookmaker odds (corners, cards …): they count in the chance, not in the odds. */
  missingOdds: number;
  /** Average return per 1 kr staked: chance × odds; null unless every leg has odds. */
  expectedReturn: number | null;
  /** Fair combined odds from our chance. */
  fairOdds: number;
}

export function couponMath(legs: CouponLeg[]): CouponMath | null {
  if (!legs.length) return null;
  const probability = legs.reduce((s, l) => s * l.probability, 1);
  const priced = legs.filter((l) => l.odds && l.odds > 1);
  const odds = priced.length ? priced.reduce((s, l) => s * l.odds!, 1) : null;
  const missingOdds = legs.length - priced.length;
  return { legs: legs.length, probability, odds, missingOdds, expectedReturn: odds && !missingOdds ? probability * odds : null, fairOdds: 1 / probability };
}
