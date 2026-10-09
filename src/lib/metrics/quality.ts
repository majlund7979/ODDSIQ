// Data Quality Engine: how fresh and complete the inputs behind a market are.

const MIN = 60_000;

export type Freshness = "Fresh" | "Aging" | "Stale" | "Missing";

export interface DataQualityInput {
  now: number;
  oddsUpdatedAt?: number;
  statsUpdatedAt?: number;
  injuriesUpdatedAt?: number;
  lineupConfirmedAt?: number;
  hoursToKickoff: number;
  sourceReliability: number; // 0-1
  booksQuoting: number;
  booksTracked: number;
}

export interface DataQualityResult {
  score: number;
  odds: Freshness;
  statistics: Freshness;
  injuries: Freshness;
  lineup: "Confirmed" | "Expected" | "Not yet due";
  completeness: number; // 0-1 share of tracked books quoting
}

function freshness(now: number, at: number | undefined, freshMin: number, staleMin: number): Freshness {
  if (at === undefined) return "Missing";
  const age = (now - at) / MIN;
  if (age <= freshMin) return "Fresh";
  if (age <= staleMin) return "Aging";
  return "Stale";
}

const points: Record<Freshness, number> = { Fresh: 1, Aging: 0.6, Stale: 0.2, Missing: 0 };

export function dataQuality(i: DataQualityInput): DataQualityResult {
  const odds = freshness(i.now, i.oddsUpdatedAt, 2, 15);
  const statistics = freshness(i.now, i.statsUpdatedAt, 60, 24 * 60);
  const injuries = freshness(i.now, i.injuriesUpdatedAt, 120, 24 * 60);
  const lineupDue = i.hoursToKickoff <= 1;
  const lineup = i.lineupConfirmedAt !== undefined ? "Confirmed" : lineupDue ? "Expected" : "Not yet due";
  const completeness = i.booksTracked ? i.booksQuoting / i.booksTracked : 0;
  const lineupPts = lineup === "Expected" ? 0.4 : 1;
  const score =
    100 *
    (0.35 * points[odds] +
      0.2 * completeness +
      0.15 * points[statistics] +
      0.1 * points[injuries] +
      0.1 * lineupPts +
      0.1 * i.sourceReliability);
  return { score: Math.round(score), odds, statistics, injuries, lineup, completeness };
}
