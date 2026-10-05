// Squads and last matches for the top-scorer factor on the goal lines
// (src/lib/top-scorer.ts). Season totals come from the data runs; the last
// matches player by player are fetched on page visits for teams playing within
// a day and a half, at most once a day per team, a few teams per visit slot.

import type { PrismaClient } from "@/generated/prisma/client";
import { API_FOOTBALL, seasonFor, type ApiFootballFeed, type PlayerMatch } from "@/lib/stats/api-football";
import { claimSlot } from "@/lib/stats/lineups";
import type { PlayerSeason } from "@/lib/stats/types";
import { RECENT_MATCHES } from "@/lib/team-leaders";

const MIN = 60_000;
const HOUR = 60 * MIN;
export const SCORER_LOOKAHEAD_MS = 36 * HOUR;
export const SCORER_REFRESH_MS = 20 * HOUR;
export const SCORER_VISIT_INTERVAL_MS = 20 * MIN;
/** Requests one visit slot may use (one per team for its fixtures, one per match not stored yet). */
export const SCORER_MAX_REQUESTS = 30;

export interface TeamScoring {
  players: PlayerSeason[];
  recent: PlayerMatch[];
}

/** Season rows (newest season per competition) and the last RECENT_MATCHES matches for both teams of each event. */
export async function loadScoring(prisma: PrismaClient, eventIds: string[], now: number): Promise<Map<string, { home: TeamScoring; away: TeamScoring }>> {
  const out = new Map<string, { home: TeamScoring; away: TeamScoring }>();
  if (!eventIds.length) return out;
  const fixtures = await prisma.statsFixture.findMany({
    where: { provider: API_FOOTBALL, eventId: { in: eventIds }, homeTeamId: { not: null }, awayTeamId: { not: null } },
    select: { eventId: true, homeTeamId: true, awayTeamId: true },
  });
  const teamIds = [...new Set(fixtures.flatMap((f) => [f.homeTeamId!, f.awayTeamId!]))];
  if (!teamIds.length) return out;
  const season = seasonFor(now);
  const [seasonRows, matchRows] = await Promise.all([
    prisma.playerSeasonStat.findMany({ where: { provider: API_FOOTBALL, teamId: { in: teamIds }, season: { gte: season - 1 } } }),
    prisma.playerMatchStat.findMany({ where: { provider: API_FOOTBALL, teamId: { in: teamIds }, kickoff: { gt: new Date(now - 120 * 86_400_000) } }, orderBy: { kickoff: "desc" } }),
  ]);
  // Internationals and calendar-year leagues name seasons differently: the newest stored per team and competition.
  const newest = new Map<string, number>();
  for (const p of seasonRows) newest.set(`${p.leagueId}:${p.teamId}`, Math.max(newest.get(`${p.leagueId}:${p.teamId}`) ?? 0, p.season));
  const team = (teamId: number): TeamScoring => {
    const players = seasonRows.filter((p) => p.teamId === teamId && p.season === newest.get(`${p.leagueId}:${p.teamId}`));
    const mine = matchRows.filter((m) => m.teamId === teamId);
    const last = new Set([...new Set(mine.map((m) => m.fixtureId))].slice(0, RECENT_MATCHES));
    return {
      players,
      recent: mine.filter((m) => last.has(m.fixtureId)).map((m) => ({ playerId: m.playerId, name: m.name, kickoff: m.kickoff.getTime(), minutes: m.minutes, shotsOn: m.shotsOn, goals: m.goals, assists: m.assists, foulsCommitted: m.foulsCommitted, foulsDrawn: m.foulsDrawn })),
    };
  };
  for (const f of fixtures) if (f.eventId && !out.has(f.eventId)) out.set(f.eventId, { home: team(f.homeTeamId!), away: team(f.awayTeamId!) });
  return out;
}

export interface ScorerRefreshSummary {
  due: number;
  teams: number;
  requests: number;
  error: string | null;
}

/** Fetches the last matches, player by player, for teams playing soon whose were not fetched today. */
export async function refreshScorerForm(prisma: PrismaClient, feed: ApiFootballFeed, now: number, maxRequests = SCORER_MAX_REQUESTS): Promise<ScorerRefreshSummary> {
  const fixtures = await prisma.statsFixture.findMany({
    where: { provider: API_FOOTBALL, eventId: { not: null }, status: { not: "finished" }, kickoff: { gt: new Date(now), lte: new Date(now + SCORER_LOOKAHEAD_MS) } },
    select: { homeTeamId: true, awayTeamId: true },
    orderBy: { kickoff: "asc" },
  });
  const teams = [...new Set(fixtures.flatMap((f) => [f.homeTeamId, f.awayTeamId]).filter((t): t is number => t !== null))];
  const syncId = (t: number) => `${API_FOOTBALL}:recent:${t}`;
  const synced = new Map((await prisma.playerStatsSync.findMany({ where: { id: { in: teams.map(syncId) } } })).map((r) => [r.id, r.fetchedAt.getTime()]));
  const due = teams.filter((t) => now - (synced.get(syncId(t)) ?? 0) >= SCORER_REFRESH_MS);
  const s: ScorerRefreshSummary = { due: due.length, teams: 0, requests: 0, error: null };
  try {
    for (const teamId of due) {
      if (s.requests + 1 + RECENT_MATCHES > maxRequests) break;
      const last = (await feed.lastFixtures(teamId, RECENT_MATCHES)).data.filter((f) => f.status === "finished");
      s.requests++;
      const have = new Set((await prisma.playerMatchStat.findMany({ where: { provider: API_FOOTBALL, teamId, fixtureId: { in: last.map((f) => f.id) } }, select: { fixtureId: true }, distinct: ["fixtureId"] })).map((r) => r.fixtureId));
      for (const f of last.filter((f) => !have.has(f.id))) {
        const ps = (await feed.fixturePlayers(f.id, teamId)).data;
        s.requests++;
        await prisma.playerMatchStat.createMany({ data: ps.map((p) => ({ ...p, provider: API_FOOTBALL, fixtureId: f.id, teamId, kickoff: new Date(f.kickoff), fetchedAt: new Date(now) })), skipDuplicates: true });
      }
      await prisma.playerStatsSync.upsert({ where: { id: syncId(teamId) }, create: { id: syncId(teamId), fetchedAt: new Date(now) }, update: { fetchedAt: new Date(now) } });
      s.teams++;
    }
  } catch (e) {
    s.error = e instanceof Error ? e.message.trim().split("\n").at(-1)! : String(e);
  }
  return s;
}

/** After a page visit: one visit per interval fetches; null when another visit had the slot. */
export async function refreshScorerFormOnVisit(prisma: PrismaClient, feed: ApiFootballFeed, now = Date.now()): Promise<ScorerRefreshSummary | null> {
  if (!(await claimSlot(prisma, "scorers:visit", SCORER_VISIT_INTERVAL_MS, now))) return null;
  return refreshScorerForm(prisma, feed, now);
}
