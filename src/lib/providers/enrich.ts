// Extra markets for the leagues whose match odds come from The Odds API: its
// free plan only covers the match winner (h2h), so over/under 2.5, both teams
// score and double chance come from API-Football's odds for the same matches.
// Prices attach to the existing events (matched by kickoff and team names), so
// no match is listed twice.

import type { PrismaClient } from "@/generated/prisma/client";
import { matchTeam } from "@/lib/model/teams";
import { API_FOOTBALL_ODDS, type ApiFootballOddsFeed } from "./api-football-odds";
import { MARKET_SELECTIONS } from "./ingest";
import type { FeedMarketType, FeedPrice } from "./types";

const HOUR = 3_600_000;
/** Markets taken from API-Football for these events; the match winner stays with The Odds API. */
export const ENRICH_MARKETS: FeedMarketType[] = ["OU25", "BTTS", "DC"];
const NAMES: Record<string, string> = { OU25: "Total Goals 2.5", BTTS: "Both Teams To Score", DC: "Double Chance" };
/** Refresh a league's extra markets at most this often. */
export const ENRICH_INTERVAL_MS = 5 * HOUR;
const KICKOFF_TOLERANCE_MS = 2 * HOUR;

export interface EnrichSummary {
  leagues: string[];
  matched: number;
  unmatched: number;
  snapshots: number;
  error: string | null;
}

function selectionName(m: FeedMarketType, sel: string, home: string, away: string): string {
  if (m === "OU25") return `${sel === "over" ? "Over" : "Under"} 2.5`;
  if (m === "BTTS") return sel === "yes" ? "Yes" : "No";
  return sel === "1x" ? `${home} or draw` : sel === "x2" ? `Draw or ${away}` : `${home} or ${away}`;
}

/**
 * For each league key with stored events kicking off within two days, buys API-Football's odds and adds the extra
 * markets to the matching events of `prefix`. Never fails the run: errors are reported in the summary.
 */
export async function enrichMarkets(prisma: PrismaClient, feed: ApiFootballOddsFeed, opts: { keys: string[]; now?: number; prefix?: string }): Promise<EnrichSummary> {
  const now = opts.now ?? Date.now();
  const prefix = opts.prefix ?? "toa";
  const out: EnrichSummary = { leagues: [], matched: 0, unmatched: 0, snapshots: 0, error: null };
  try {
    const comps = new Set((await feed.competitions()).data.map((c) => c.key));
    for (const key of opts.keys.filter((k) => comps.has(k))) {
      const events = await prisma.event.findMany({
        where: { leagueId: `${prefix}-${key}`, status: "scheduled", kickoff: { gt: new Date(now), lte: new Date(now + 48 * HOUR) } },
        include: { homeTeam: true, awayTeam: true },
      });
      if (!events.length) continue;
      const recent = await prisma.oddsSnapshot.findFirst({
        where: { sourceId: API_FOOTBALL_ODDS, observedAt: { gt: new Date(now - ENRICH_INTERVAL_MS) }, selection: { eventId: { in: events.map((e) => e.id) } } },
        select: { id: true },
      });
      if (recent) continue;
      out.leagues.push(key);
      const odds = (await feed.odds(key)).data;
      for (const af of odds) {
        const ev = events.find((e) => Math.abs(e.kickoff.getTime() - af.kickoff) <= KICKOFF_TOLERANCE_MS && matchTeam(af.home, [e.homeTeam.name]) && matchTeam(af.away, [e.awayTeam.name]));
        if (!ev) {
          out.unmatched++;
          continue;
        }
        out.matched++;
        out.snapshots += await storeExtraPrices(prisma, ev.id, ev.homeTeam.name, ev.awayTeam.name, af.prices, now);
      }
    }
  } catch (e) {
    out.error = (e instanceof Error ? e.message : String(e)).trim().split("\n").at(-1)!.slice(0, 300);
  }
  return out;
}

async function storeExtraPrices(prisma: PrismaClient, eventId: string, home: string, away: string, prices: FeedPrice[], now: number): Promise<number> {
  const kept = prices.filter((p) => ENRICH_MARKETS.includes(p.market));
  if (!kept.length) return 0;
  for (const [book, name] of new Map(kept.map((p) => [p.bookmakerKey, p.bookmakerName]))) {
    // Margin and reliability are not measured for these books; 0 marks them as unknown.
    await prisma.bookmaker.upsert({ where: { id: `apf-${book}` }, create: { id: `apf-${book}`, name, margin: 0, reliability: 0 }, update: {} });
  }
  for (const m of [...new Set(kept.map((p) => p.market))]) {
    const marketId = `${eventId}-${m.toLowerCase()}`;
    await prisma.market.upsert({ where: { id: marketId }, create: { id: marketId, eventId, type: m, name: NAMES[m] }, update: {} });
    for (const sel of MARKET_SELECTIONS[m]) {
      const id = `${marketId}-${sel}`;
      await prisma.selection.upsert({ where: { id }, create: { id, marketId, eventId, name: selectionName(m, sel, home, away) }, update: {} });
    }
  }
  const rows = kept.map((p) => ({ selectionId: `${eventId}-${p.market.toLowerCase()}-${p.selection}`, bookmakerId: `apf-${p.bookmakerKey}`, observedAt: new Date(now), odds: p.odds, sourceId: API_FOOTBALL_ODDS }));
  await prisma.oddsSnapshot.createMany({ data: rows });
  return rows.length;
}
