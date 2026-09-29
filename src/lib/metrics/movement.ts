// Market movement analytics: velocity, volatility and the estimated Market
// Pressure Score. None of these use betting volume: the demo feed (like most
// odds feeds) has no volume data, so pressure is always labelled "estimated".

const HOUR = 3_600_000;

export interface PricePoint {
  at: number;
  odds: number;
}

/** Price at or immediately before `at` (series sorted ascending). */
export function priceAt(series: PricePoint[], at: number): number | undefined {
  let found: number | undefined;
  for (const p of series) {
    if (p.at > at) break;
    found = p.odds;
  }
  return found;
}

/**
 * Average change in decimal odds per hour over the trailing window.
 * Negative = shortening (price falling, implied probability rising).
 */
export function oddsVelocity(series: PricePoint[], windowHours: number, now: number): number {
  if (series.length === 0 || series[0].at > now) return 0;
  const current = priceAt(series, now)!;
  const start = Math.max(now - windowHours * HOUR, series[0].at);
  const past = priceAt(series, start)!;
  const hours = (now - start) / HOUR;
  return hours > 0 ? (current - past) / hours : 0;
}

/** Standard deviation of successive log price changes (per observation). */
export function volatility(series: PricePoint[]): number {
  if (series.length < 3) return 0;
  const r: number[] = [];
  for (let i = 1; i < series.length; i++) r.push(Math.log(series[i].odds / series[i - 1].odds));
  const mean = r.reduce((s, x) => s + x, 0) / r.length;
  return Math.sqrt(r.reduce((s, x) => s + (x - mean) ** 2, 0) / (r.length - 1));
}

export type PressureLevel = "NORMAL" | "ELEVATED" | "HIGH";

export interface PressureInput {
  openOdds: number;
  currentOdds: number;
  /** Relative odds change per hour over the recent window, e.g. -0.02 = -2%/h. */
  relativeVelocityPerHour: number;
  /** Bookmakers whose price moved >1% in the consensus direction, and books quoting. */
  booksMovingWithConsensus: number;
  booksQuoting: number;
  volatility: number;
  /** Typical volatility for this market type, from history. */
  baselineVolatility: number;
  hoursToKickoff: number;
  /** Matched volume where a feed provides it; undefined for most feeds. */
  liquidity?: number;
}

export interface PressureResult {
  score: number;
  level: PressureLevel;
  estimated: boolean;
  components: { label: string; weight: number; value: number }[];
}

export const PRESSURE_DEFINITION =
  "Estimated Market Pressure (0–100) combines size of move since opening (30%), recent odds velocity (25%), share of bookmakers moving the same way (25%), volatility relative to this market's history (10%) and proximity to kickoff (10%). It does not use betting volume unless a feed supplies it.";

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function marketPressure(i: PressureInput): PressureResult {
  const move = clamp01(Math.abs(i.currentOdds / i.openOdds - 1) / 0.15);
  const velocity = clamp01(Math.abs(i.relativeVelocityPerHour) / 0.02);
  const breadth = i.booksQuoting ? clamp01(i.booksMovingWithConsensus / i.booksQuoting) : 0;
  const vol = i.baselineVolatility > 0 ? clamp01(i.volatility / (i.baselineVolatility * 2)) : 0;
  const time = i.hoursToKickoff <= 3 ? 1 : i.hoursToKickoff <= 24 ? 0.6 : 0.25;
  const components = [
    { label: "Size of move", weight: 0.3, value: move },
    { label: "Odds velocity", weight: 0.25, value: velocity },
    { label: "Bookmaker breadth", weight: 0.25, value: breadth },
    { label: "Relative volatility", weight: 0.1, value: vol },
    { label: "Time to kickoff", weight: 0.1, value: time },
  ];
  const score = Math.round(100 * components.reduce((s, c) => s + c.weight * c.value, 0));
  return {
    score,
    level: score >= 65 ? "HIGH" : score >= 40 ? "ELEVATED" : "NORMAL",
    estimated: i.liquidity === undefined,
    components,
  };
}

/** Pressure label for raw velocity alone ("ODDS PRESSURE" badge). */
export function velocityLevel(relativeVelocityPerHour: number): PressureLevel {
  const a = Math.abs(relativeVelocityPerHour);
  if (a >= 0.012) return "HIGH";
  if (a >= 0.005) return "ELEVATED";
  return "NORMAL";
}
