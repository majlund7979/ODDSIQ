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

/** How a leg on the coupon stands against the page's current pick for that match and bet type. */
export type LegStatus = "ok" | "closed" | "changed" | "odds";

export interface LegCheck {
  key: string;
  status: LegStatus;
  /** The pick the page shows now ("changed"), for the label on the coupon. */
  outcome?: string;
  /** Current odds ("ok" and "odds"), so the coupon can catch up. */
  odds?: number | null;
}

const sameOdds = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.round(a * 100) === Math.round(b * 100));

/** Compares a leg with the pick found again on the server; null means the match or bet type is not open any more. */
export function checkLeg(leg: { key: string; outcome: string; odds: number | null }, now: { outcome: string; odds: number | null } | null): LegCheck {
  if (!now) return { key: leg.key, status: "closed" };
  if (now.outcome !== leg.outcome) return { key: leg.key, status: "changed", outcome: now.outcome };
  return { key: leg.key, status: sameOdds(leg.odds, now.odds) ? "ok" : "odds", odds: now.odds };
}

/** "1 bet er lukket, og 1 har fået ny odds." for the message under the coupon; null when every leg is fine. */
export function legProblems(checks: LegCheck[]): string | null {
  const n = (s: LegStatus) => checks.filter((c) => c.status === s).length;
  const gone = n("closed") + n("changed");
  const odds = n("odds");
  const parts = [gone ? `${gone} ${gone === 1 ? "bet er" : "bets er"} ikke åbent længere` : "", odds ? `${odds} ${odds === 1 ? "bet har" : "bets har"} fået ny odds` : ""].filter(Boolean);
  if (!parts.length) return null;
  const what = parts.join(", og ");
  return `${what[0].toUpperCase()}${what.slice(1)}. ${gone ? "Fjern dem, der er markeret Lukket, og spil igen." : "Vi har rettet odds på kuponen: tjek den samlede odds og spil igen."}`;
}
