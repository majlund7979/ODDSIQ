// Closing line: each bookmaker's last price observed at or before kickoff,
// and the de-vigged consensus of those prices. Books whose last observation
// is older than CLOSE_MAX_AGE_MS before kickoff are left out, because a price
// that old is not a close.

import { devig } from "@/lib/metrics/probability";

export const CLOSE_MAX_AGE_MS = 6 * 3_600_000;

export interface PricePoint {
  bookmakerId: string;
  selectionId: string;
  observedAt: number;
  odds: number;
}

export interface ClosingLine {
  /** Number of bookmakers that quoted every selection within the window. */
  books: number;
  /** Latest observation used. */
  observedAt: number | null;
  selections: { selectionId: string; medianOdds: number; fairProbability: number }[];
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * API-Football's bet365, bwin and Pinnacle prices are added to The Odds API's match-winner markets only so Dagens bedste
 * bets can compare them (enrich.ts). Where The Odds API quotes a market, its books alone make the consensus, as before,
 * so a move between two runs is never just a change in which books are counted.
 */
function consensusBooks(books: string[]): string[] {
  return books.some((b) => b.startsWith("toa-")) ? books.filter((b) => !b.startsWith("apf-")) : books;
}

export function closingLine(points: PricePoint[], selectionIds: string[], kickoff: number, maxAgeMs = CLOSE_MAX_AGE_MS): ClosingLine | null {
  const last = new Map<string, PricePoint>();
  for (const p of points) {
    if (p.observedAt > kickoff || p.observedAt < kickoff - maxAgeMs) continue;
    const k = `${p.bookmakerId}|${p.selectionId}`;
    const prev = last.get(k);
    if (!prev || p.observedAt > prev.observedAt) last.set(k, p);
  }
  const books = consensusBooks([...new Set(points.map((p) => p.bookmakerId))].filter((b) => selectionIds.every((s) => last.has(`${b}|${s}`))));
  if (!books.length) return null;

  const fair = books.map((b) => devig(selectionIds.map((s) => last.get(`${b}|${s}`)!.odds)));
  const avg = selectionIds.map((_, i) => fair.reduce((sum, f) => sum + f[i], 0) / fair.length);
  const total = avg.reduce((a, b) => a + b, 0);
  return {
    books: books.length,
    observedAt: Math.max(...books.flatMap((b) => selectionIds.map((s) => last.get(`${b}|${s}`)!.observedAt))),
    selections: selectionIds.map((s, i) => ({ selectionId: s, medianOdds: median(books.map((b) => last.get(`${b}|${s}`)!.odds)), fairProbability: avg[i] / total })),
  };
}

/** Settles a selection from a final score. A drawn two-way (ML) market is void. */
export function settle(market: string, selection: string, home: number, away: number): "won" | "lost" | "void" {
  if (market === "ML" && home === away) return "void";
  if (market === "BTTS") return (selection === "yes") === (home > 0 && away > 0) ? "won" : "lost";
  if (market === "DC") return (selection === "1x" ? home >= away : selection === "x2" ? home <= away : home !== away) ? "won" : "lost";
  const pick = market === "OU15" ? (home + away > 1.5 ? "over" : "under") : market === "OU25" ? (home + away > 2.5 ? "over" : "under") : home > away ? "home" : home < away ? "away" : "draw";
  return selection === pick ? "won" : "lost";
}
