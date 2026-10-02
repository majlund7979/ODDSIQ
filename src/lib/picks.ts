// "Dagens bedste bets": the simple daily list. For each match kicking off in
// the next 24 hours (the window the model forecasts), take the outcome the
// model rates most likely and rank the matches by that probability.

import type { MarketRow } from "@/lib/demo/store";

export const PICK_WINDOW_MS = 24 * 3_600_000;
export const PICK_COUNTS = [5, 10] as const;

export interface Pick {
  row: MarketRow;
  /** Plain-language outcome, e.g. "Arsenal vinder" or "Over 2,5 mål". */
  outcome: string;
  probability: number;
  /** Odds at which the model's probability breaks even. */
  fairOdds: number;
  /** True when the best price pays more than the model's fair odds. */
  value: boolean;
  reason: string;
}

export function outcomeLabel(r: Pick["row"]): string {
  if (r.marketType === "OU25") return r.side === "over" ? "Over 2,5 mål" : "Under 2,5 mål";
  if (r.marketType === "BTTS") return r.side === "yes" ? "Begge hold scorer" : "Ikke begge hold scorer";
  if (r.side === "draw") return "Uafgjort";
  return `${r.selection} vinder`;
}

const pct = (p: number) => `${Math.round(p * 100)} %`;

function reason(r: MarketRow, p: number): string {
  const gap = Math.round((p - r.marketProbability) * 100);
  const market = `bookmakerne ${pct(r.marketProbability)}`;
  if (gap >= 1) return `Modellen giver ${pct(p)}, ${market}. Modellen er ${gap} procentpoint mere positiv end markedet.`;
  if (gap <= -1) return `Modellen giver ${pct(p)}, ${market}. Markedet er ${-gap} procentpoint mere positivt end modellen.`;
  return `Modellen og bookmakerne er enige: omkring ${pct(p)}.`;
}

export function dailyPicks(rows: MarketRow[], now: number, count: number): Pick[] {
  const best = new Map<string, MarketRow>();
  for (const r of rows) {
    if (r.status !== "scheduled" || r.modelProbability == null) continue;
    if (r.kickoff <= now || r.kickoff > now + PICK_WINDOW_MS) continue;
    const cur = best.get(r.eventId);
    if (!cur || r.modelProbability > cur.modelProbability!) best.set(r.eventId, r);
  }
  return [...best.values()]
    .sort((a, b) => b.modelProbability! - a.modelProbability! || a.kickoff - b.kickoff)
    .slice(0, count)
    .map((row) => {
      const p = row.modelProbability!;
      return { row, outcome: outcomeLabel(row), probability: p, fairOdds: 1 / p, value: row.bestOdds * p > 1, reason: reason(row, p) };
    });
}
