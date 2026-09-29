// Experimental market regime label. Rules use only observable data and are
// applied in order; the first match wins. It is a description, not a forecast.

export type Regime = "LIVE EVENT" | "POST-NEWS MOVEMENT" | "LATE LINEUP PERIOD" | "HIGH VOLATILITY" | "LOW LIQUIDITY" | "NORMAL";

export interface RegimeInput {
  live: boolean;
  minutesToKickoff: number;
  lineupsConfirmed: boolean;
  /** Minutes since the latest news item, if any. */
  minutesSinceNews: number | null;
  /** Consensus price change since that news item. */
  moveSinceNews: number;
  /** Current 24h volatility divided by the median across tracked markets. */
  volatilityRatio: number;
  booksQuoting: number;
  booksTracked: number;
}

export const REGIME_RULES: { regime: Regime; rule: string }[] = [
  { regime: "LIVE EVENT", rule: "The event is in play." },
  { regime: "POST-NEWS MOVEMENT", rule: "A news item arrived in the last 60 minutes and the price has moved 2% or more since." },
  { regime: "LATE LINEUP PERIOD", rule: "Lineups are confirmed and kickoff is within 75 minutes." },
  { regime: "HIGH VOLATILITY", rule: "24-hour volatility is at least 3× the median across tracked markets." },
  { regime: "LOW LIQUIDITY", rule: "Fewer than 70% of tracked bookmakers are quoting." },
  { regime: "NORMAL", rule: "None of the above." },
];

export const REGIME_NOTE = "Experimental. Rules are applied in order and use observable data only; the label describes current conditions and predicts nothing.";

export function marketRegime(r: RegimeInput): { regime: Regime; reason: string } {
  if (r.live) return { regime: "LIVE EVENT", reason: "The event is in play." };
  if (r.minutesSinceNews !== null && r.minutesSinceNews <= 60 && Math.abs(r.moveSinceNews) >= 0.02)
    return { regime: "POST-NEWS MOVEMENT", reason: `News ${Math.round(r.minutesSinceNews)} min ago; price ${r.moveSinceNews > 0 ? "+" : "−"}${Math.abs(r.moveSinceNews * 100).toFixed(1)}% since.` };
  if (r.lineupsConfirmed && r.minutesToKickoff <= 75) return { regime: "LATE LINEUP PERIOD", reason: `Lineups confirmed; kickoff in ${Math.round(r.minutesToKickoff)} min.` };
  if (r.volatilityRatio >= 3) return { regime: "HIGH VOLATILITY", reason: `Volatility ${r.volatilityRatio.toFixed(1)}× the market median.` };
  if (r.booksTracked > 0 && r.booksQuoting / r.booksTracked < 0.7) return { regime: "LOW LIQUIDITY", reason: `${r.booksQuoting} of ${r.booksTracked} bookmakers quoting.` };
  return { regime: "NORMAL", reason: "No regime rule applies." };
}
