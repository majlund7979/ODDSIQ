// Results between the six-hourly data runs. GitHub runs that schedule late or
// not at all, which left finished matches unsettled on the results board for
// hours, so a page visit also settles them: at most once per interval, and only
// for competitions with a stored match that is over and still unsettled.

import type { PrismaClient } from "@/generated/prisma/client";
import { claimSlot } from "@/lib/stats/lineups";
import { ApiFootballOddsFeed } from "./api-football-odds";
import { afOddsConfig, configuredFeed } from "./config";
import { competitionsToSettle, settleLeague, SETTLE_AFTER_MS } from "./ingest";
import type { OddsFeed } from "./types";

export const SETTLE_VISIT_INTERVAL_MS = 15 * 60_000;

export interface VisitSettleSummary {
  competitions: number;
  results: number;
  error: string | null;
}

export async function settleFeed(prisma: PrismaClient, feed: OddsFeed, prefix: string, now: number): Promise<VisitSettleSummary> {
  const s: VisitSettleSummary = { competitions: 0, results: 0, error: null };
  try {
    const keys = await competitionsToSettle(prisma, prefix, now);
    if (!keys.length) return s;
    // Also loads API-Football's current seasons, which its results call needs.
    const known = new Set((await feed.competitions()).data.map((c) => c.key));
    for (const key of keys.filter((k) => known.has(k))) {
      const r = await settleLeague(prisma, feed, prefix, key, now, now - SETTLE_AFTER_MS);
      s.competitions++;
      s.results += r.results;
    }
  } catch (e) {
    s.error = e instanceof Error ? e.message.trim().split("\n").at(-1)! : String(e);
  }
  return s;
}

/** Settles finished matches from both odds feeds; null when another visit had this interval's slot. */
export async function settleOnVisit(prisma: PrismaClient, now = Date.now()): Promise<VisitSettleSummary[] | null> {
  const feeds: [OddsFeed, string][] = [];
  const af = afOddsConfig();
  if (af.enabled) {
    // Only the competitions waiting for a result: API-Football's season lookup is one call per competition.
    const keys = (await competitionsToSettle(prisma, "apf", now)).filter((k) => af.keys.includes(k));
    if (keys.length) feeds.push([new ApiFootballOddsFeed({ apiKey: process.env.STATS_API_KEY!, keys }), "apf"]);
  }
  const toa = configuredFeed();
  if (toa && (await competitionsToSettle(prisma, "toa", now)).length) feeds.push([toa, "toa"]);
  if (!feeds.length || !(await claimSlot(prisma, "results:visit", SETTLE_VISIT_INTERVAL_MS, now))) return null;
  const out: VisitSettleSummary[] = [];
  for (const [feed, prefix] of feeds) out.push(await settleFeed(prisma, feed, prefix, now));
  return out;
}
