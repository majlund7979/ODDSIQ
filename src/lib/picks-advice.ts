// Plain advice shown on every pick: a traffic-light risk level, a stake
// suggestion and a note when the odds have moved. All three are rules of
// thumb on top of the pick's probability, not fitted parameters.

/** Probability at or above which a pick is green. */
export const GREEN_FROM = 0.7;
/** Probability at or above which a pick is yellow; below it is red. */
export const YELLOW_FROM = 0.55;

export type RiskLevel = "green" | "yellow" | "red";

export interface Risk {
  level: RiskLevel;
  label: string;
}

export function riskOf(p: number): Risk {
  if (p >= GREEN_FROM) return { level: "green", label: "Lav risiko" };
  if (p >= YELLOW_FROM) return { level: "yellow", label: "Middel risiko" };
  return { level: "red", label: "Høj risiko" };
}

/** Share of the bankroll per level, used only when there are no bookmaker odds to size the bet with. */
export const STAKE_SHARE: Record<RiskLevel, number> = { green: 0.03, yellow: 0.02, red: 0.01 };
export const DEFAULT_BANKROLL = 1000;
/** Quarter Kelly: a quarter of the stake the Kelly criterion gives, because our probabilities are estimates. */
export const KELLY_FRACTION = 0.25;
/** Never more than this share of the bankroll on one bet. */
export const STAKE_CAP = 0.05;
export const STAKE_VERSION = "kvart-kelly-v1";

export interface StakeAdvice {
  /** Share of the bankroll to stake; 0 means no bet. */
  share: number;
  /** Short note shown next to the amount. */
  note: string;
  /** The full reason, shown on hover. */
  reason: string;
}

/** The Kelly share for chance p at decimal odds: (p × odds − 1) / (odds − 1); 0 or less means the odds pay too little. */
export const kelly = (p: number, odds: number) => (p * odds - 1) / (odds - 1);

/**
 * Stake by quarter Kelly (Mads, 2026-10-03): a quarter of the Kelly share, capped at 5 % of the bankroll.
 * When the odds pay less than our fair odds, Kelly says don't bet, so the share is 0.
 * Without bookmaker odds, falls back to 3 / 2 / 1 % by risk level.
 */
export function stakeAdvice(p: number, odds: number | null): StakeAdvice {
  const pct = (x: number) => `${String(Math.round(x * 1000) / 10).replace(".", ",")} %`;
  if (!odds || odds <= 1) {
    const risk = riskOf(p);
    const base = STAKE_SHARE[risk.level];
    return { share: base, note: `${pct(base)} af puljen`, reason: `Ingen bookmakerodds endnu, så indsatsen følger risikoen: ${risk.label} giver ${pct(base)} af puljen.` };
  }
  const k = kelly(p, odds);
  if (k <= 0)
    return {
      share: 0,
      note: "ingen værdi i oddsen",
      reason: `Oddsen ${odds.toFixed(2).replace(".", ",")} betaler mindre end vores fair odds ${(1 / p).toFixed(2).replace(".", ",")}, så kvart-Kelly siger: spil ikke.`,
    };
  const share = Math.min(STAKE_CAP, k * KELLY_FRACTION);
  const capped = share < k * KELLY_FRACTION;
  return {
    share,
    note: `${pct(share)} af puljen, kvart-Kelly`,
    reason: `Kelly giver ${pct(k)} af puljen ved ${Math.round(p * 100)} % chance og odds ${odds.toFixed(2).replace(".", ",")}. Vi bruger en fjerdedel, fordi procenterne er skøn${capped ? `, og højst ${pct(STAKE_CAP)}` : ""}.`,
  };
}

/** Rounds a stake to something you would actually bet: whole 5 kr under 100 kr, whole 10 kr above. */
export function roundStake(kr: number): number {
  if (kr <= 0) return 0;
  const step = kr < 100 ? 5 : 10;
  return Math.max(step, Math.round(kr / step) * step);
}

/** Smallest change since the market opened that gets an arrow. */
export const MOVE_MIN = 0.03;

export interface OddsMove {
  direction: "down" | "up";
  /** Size of the change, as a positive share of the opening odds. */
  size: number;
  from: number;
  to: number;
  /** What happened, as a fact. */
  fact: string;
  /** Possible reasons, never presented as the cause. */
  maybe: string;
}

/** The odds move since opening, when it is big enough to show. `movement` is (current − opening) / opening. */
export function oddsMove(movement: number, from: number, to: number): OddsMove | null {
  if (!Number.isFinite(movement) || Math.abs(movement) < MOVE_MIN) return null;
  const size = Math.abs(movement);
  const pct = `${Math.round(size * 100)} %`;
  const dec = (x: number) => x.toFixed(2).replace(".", ",");
  if (movement < 0)
    return {
      direction: "down",
      size,
      from,
      to,
      fact: `Oddsen er faldet ${pct} siden markedet åbnede (${dec(from)} → ${dec(to)}).`,
      maybe: "Det kan skyldes, at der er satset mange penge på udfaldet, eller at bookmakerne har fået nye oplysninger. Vi ved ikke hvilket.",
    };
  return {
    direction: "up",
    size,
    from,
    to,
    fact: `Oddsen er steget ${pct} siden markedet åbnede (${dec(from)} → ${dec(to)}).`,
    maybe: "Det kan skyldes, at der er satset på modstanderen, eller at bookmakerne har fået nye oplysninger. Vi ved ikke hvilket.",
  };
}
