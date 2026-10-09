// Plain advice shown on every pick: a traffic-light risk level, a stake
// suggestion and a note when the odds have moved. All three are rules of
// thumb on top of the pick's probability, not fitted parameters.

import { median } from "@/lib/providers/closing";

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
export const STAKE_VERSION = "kvart-kelly-v2";
/** Small fixed stake shown when the odds pay less than fair odds (Mads, 2026-10-04: "spil ikke" felt wrong on a best-bets page). */
export const NO_VALUE_SHARE = 0.01;

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
 * When the odds pay less than our fair odds, Kelly says don't bet; we then suggest a small fixed 1 % and say why.
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
  const dec = (x: number) => x.toFixed(2).replace(".", ",");
  if (k <= 0)
    return {
      share: NO_VALUE_SHARE,
      note: `${pct(NO_VALUE_SHARE)} af puljen, ingen værdi i oddsen`,
      reason: `Fair odds ${dec(1 / p)}, bedste odds ${dec(odds)}. Oddsen betaler mindre, end chancen er værd, så kvart-Kelly giver 0. Spiller du alligevel, så hold det på ${pct(NO_VALUE_SHARE)} af puljen.`,
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

export interface BookComparison {
  rows: { book: string; odds: number; best: boolean; value: boolean }[];
  /** Median of the bookmakers' prices. */
  median: number;
  /** How much more the best price pays than the median, as a share of the median. */
  bestOverMedian: number;
}

/** The bookmakers' prices for one bet side by side: the best one marked, and which pay more than our fair odds. */
export function compareBooks(quotes: { book: string; odds: number; at?: number }[] | undefined, fairOdds: number): BookComparison | null {
  // A bookmaker quoted by both odds feeds is listed once, at its latest price.
  const byBook = new Map<string, { book: string; odds: number; at?: number }>();
  for (const q of quotes ?? []) {
    const prev = byBook.get(q.book);
    if (!prev || (q.at ?? 0) > (prev.at ?? 0)) byBook.set(q.book, q);
  }
  const list = [...byBook.values()].filter((q) => Number.isFinite(q.odds) && q.odds > 1).sort((a, b) => b.odds - a.odds);
  if (list.length < 2) return null;
  const mid = median(list.map((q) => q.odds));
  return {
    rows: list.map((q, i) => ({ ...q, best: i === 0 || q.odds === list[0].odds, value: q.odds > fairOdds })),
    median: mid,
    bestOverMedian: list[0].odds / mid - 1,
  };
}

/** Friendlies are less predictable (rotation, low stakes), so their picks carry a warning. */
export const isFriendly = (league: string) => /friendl|venskab/i.test(league);
