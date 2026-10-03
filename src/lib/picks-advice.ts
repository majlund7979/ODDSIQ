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

/** Share of the bankroll per level. */
export const STAKE_SHARE: Record<RiskLevel, number> = { green: 0.03, yellow: 0.02, red: 0.01 };
export const DEFAULT_BANKROLL = 1000;

export interface StakeAdvice {
  /** Share of the bankroll to stake. */
  share: number;
  /** Short note shown next to the amount. */
  note: string;
  /** The full reason, shown on hover. */
  reason: string;
}

/**
 * Stake as a share of the bankroll: 3 % for green, 2 % for yellow and 1 % for red.
 * Halved when the best odds pay less than our fair odds, because then the bet loses money in the long run even if it often wins.
 */
export function stakeAdvice(p: number, odds: number | null): StakeAdvice {
  const risk = riskOf(p);
  const base = STAKE_SHARE[risk.level];
  const pct = (x: number) => `${String(Math.round(x * 1000) / 10).replace(".", ",")} %`;
  if (odds && odds > 1 && p * odds < 1)
    return {
      share: base / 2,
      note: `${pct(base / 2)} af puljen, halv indsats`,
      reason: `${risk.label} giver ${pct(base)} af puljen, men oddsen er lavere end vores fair odds, så indsatsen er halveret.`,
    };
  return { share: base, note: `${pct(base)} af puljen`, reason: `${risk.label} giver ${pct(base)} af puljen.` };
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
