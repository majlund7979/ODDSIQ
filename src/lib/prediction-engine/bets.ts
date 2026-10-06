// The prediction engine's probabilities for "Dagens bedste bets" (Mads, 2026-10-06: "brug den nye version",
// value bets from odds 1,25, the looser filter). The engine still runs in shadow mode, so this reads its newest
// prediction per selection straight from schema pe, like the Modelpanel does. It covers 1X2 and over/under 2,5 mål
// in its 16 leagues; the value test itself (probability × the site's live best odds) is in picks.ts.

import { db } from "@/lib/db";
import type { MarketRow } from "@/lib/demo/store";

export interface EngineProb {
  probability: number;
  modelVersion: string;
  /** When the engine's inputs were read. */
  dataAsOf: Date | null;
}

export type EngineProbs = Map<string, EngineProb>;

/** Site market type for an engine market and line; null for what the site's list does not use. */
export function siteMarket(market: string, line: number | null): string | null {
  if (market === "1x2") return "1X2";
  if (market === "ou" && line === 2.5) return "OU25";
  return null;
}

export const engineKey = (eventId: string, marketType: string, side: string) => `${eventId}|${marketType}|${side}`;

export interface EngineRow {
  site_event_id: string;
  market: string;
  line: number | null;
  selection: string;
  probability: number;
  model_version: string;
  data_as_of: Date | null;
}

export function shapeEngine(rows: EngineRow[]): EngineProbs {
  const out: EngineProbs = new Map();
  for (const r of rows) {
    const m = siteMarket(r.market, r.line);
    const p = Number(r.probability);
    if (!m || !(p > 0 && p < 1)) continue;
    out.set(engineKey(r.site_event_id, m, r.selection), { probability: p, modelVersion: r.model_version, dataAsOf: r.data_as_of });
  }
  return out;
}

/** Looks a site row up in the engine's numbers. */
export const engineFor = (probs: EngineProbs) => (row: MarketRow) => probs.get(engineKey(row.eventId, row.marketType, row.side)) ?? null;

const SQL = `
  SELECT DISTINCT ON (p.match_id, p.market, p.line, p.selection)
         m.site_event_id, p.market, p.line::float8 AS line, p.selection, p.probability::float8 AS probability,
         p.model_version, p.data_as_of
  FROM pe.prediction p JOIN pe.match m ON m.id = p.match_id
  WHERE NOT p.is_backtest AND m.site_event_id IS NOT NULL AND m.kickoff > $1 AND p.market IN ('1x2', 'ou')
  ORDER BY p.match_id, p.market, p.line, p.selection, p.created_at DESC, p.id DESC`;

/** The newest engine probability per selection for matches not yet started. Empty when schema pe is missing. */
export async function loadEngineProbs(now: number): Promise<EngineProbs> {
  const rows = await db().$queryRawUnsafe<EngineRow[]>(SQL, new Date(now)).catch((e) => {
    console.error(`prediction engine read failed: ${e instanceof Error ? e.message : e}`);
    return [] as EngineRow[];
  });
  return shapeEngine(rows);
}
