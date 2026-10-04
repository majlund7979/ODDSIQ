// Lineups between the six-hourly data runs. Teams publish them about an hour
// before kickoff, which the six-hourly run almost never hits, so a cheap
// route calls this every ten minutes. It reads the fixtures the data run
// already matched to our matches and only calls the provider for those close
// to kickoff that have no lineups yet, so it costs nothing when no match is near.

import type { PrismaClient } from "@/generated/prisma/client";
import type { StatsFeed, StatsFixture, TeamLineup } from "./types";

const MIN = 60_000;
/** Look from this long before kickoff… */
export const LINEUP_LOOKAHEAD_MS = 90 * MIN;
/** …until shortly after it, in case the lineups came out late. */
export const LINEUP_GRACE_MS = 20 * MIN;
/** Requests one run may use. */
export const LINEUP_MAX_REQUESTS = 40;

export interface LineupRefreshSummary {
  due: number;
  fetched: number;
  requests: number;
  remaining: number | null;
  error: string | null;
}

/** Stores both teams' lineups and marks the match as confirmed. Shared with the six-hourly run. */
export async function storeLineups(prisma: PrismaClient, fixtureId: string, eventId: string, lineups: TeamLineup[], now: number): Promise<void> {
  for (const l of lineups) {
    const data = { team: l.team, formation: l.formation, coach: l.coach, startXI: l.startXI as object[], substitutes: l.substitutes as object[], fetchedAt: new Date(now) };
    await prisma.teamLineup.upsert({ where: { fixtureId_side: { fixtureId, side: l.side } }, create: { fixtureId, side: l.side, ...data }, update: data });
  }
  await prisma.statsFixture.update({ where: { id: fixtureId }, data: { lineupsAt: new Date(now) } });
  await prisma.event.update({ where: { id: eventId }, data: { lineupConfirmedAt: new Date(now) } });
}

/** The provider's fixture from our stored row ("api-football:123" → id "123"). */
export function fixtureFromRow(r: { id: string; leagueId: number; kickoff: Date; home: string; away: string; status: string; homeGoals: number | null; awayGoals: number | null; homeTeamId: number | null; awayTeamId: number | null }): StatsFixture {
  return {
    id: r.id.slice(r.id.indexOf(":") + 1),
    leagueId: r.leagueId,
    kickoff: r.kickoff.getTime(),
    home: r.home,
    away: r.away,
    status: (["scheduled", "live", "finished"].includes(r.status) ? r.status : "other") as StatsFixture["status"],
    homeGoals: r.homeGoals,
    awayGoals: r.awayGoals,
    homeId: r.homeTeamId,
    awayId: r.awayTeamId,
  };
}

export async function refreshLineups(prisma: PrismaClient, feed: StatsFeed, opts: { now?: number; maxRequests?: number } = {}): Promise<LineupRefreshSummary> {
  const now = opts.now ?? Date.now();
  const max = opts.maxRequests ?? LINEUP_MAX_REQUESTS;
  const due = await prisma.statsFixture.findMany({
    where: {
      provider: feed.provider,
      eventId: { not: null },
      lineupsAt: null,
      status: { not: "finished" },
      kickoff: { gte: new Date(now - LINEUP_GRACE_MS), lte: new Date(now + LINEUP_LOOKAHEAD_MS) },
    },
    orderBy: { kickoff: "asc" },
    take: max,
  });
  const s: LineupRefreshSummary = { due: due.length, fetched: 0, requests: 0, remaining: null, error: null };
  try {
    for (const row of due) {
      if (s.remaining !== null && s.remaining <= 0) break;
      const r = await feed.lineups(fixtureFromRow(row));
      s.requests++;
      s.remaining = r.quota.remaining;
      if (r.data.length < 2) continue; // not published yet; the next run tries again
      await storeLineups(prisma, row.id, row.eventId!, r.data, now);
      s.fetched++;
    }
  } catch (e) {
    s.error = e instanceof Error ? e.message.trim().split("\n").at(-1)! : String(e);
  }
  return s;
}

/** A page visit checks for lineups at most this often. */
export const LINEUP_VISIT_INTERVAL_MS = 4 * MIN;
const VISIT_SYNC_ID = "lineups:visit";

/**
 * GitHub runs the ten-minute schedule late or not at all (on 2026-10-04 the
 * lineup job ran once in an hour and a half), so visits also look for lineups.
 * Claiming the slot is one conditional write, so only one server instance
 * calls the provider per interval; returns null when another visit already did.
 */
export async function refreshLineupsOnVisit(prisma: PrismaClient, feed: StatsFeed, now = Date.now()): Promise<LineupRefreshSummary | null> {
  const before = new Date(now - LINEUP_VISIT_INTERVAL_MS);
  const claimed = await prisma.playerStatsSync.updateMany({ where: { id: VISIT_SYNC_ID, fetchedAt: { lt: before } }, data: { fetchedAt: new Date(now) } });
  if (claimed.count === 0) {
    const created = await prisma.playerStatsSync.createMany({ data: [{ id: VISIT_SYNC_ID, fetchedAt: new Date(now) }], skipDuplicates: true });
    if (created.count === 0) return null;
  }
  return refreshLineups(prisma, feed, { now, maxRequests: 10 });
}
