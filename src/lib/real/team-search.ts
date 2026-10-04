// The team search: finds teams by name and loads a team's squad statistics for
// the season. Squads come from the database when they are fresh; otherwise
// from API-Football (all competitions, up to five pages) and are stored, so a
// team costs at most a handful of requests a day however often it is opened.

import type { PrismaClient } from "@/generated/prisma/client";
import { API_FOOTBALL, seasonFor, type ApiFootballFeed, type PlayerMatch, type TeamHit } from "@/lib/stats/api-football";
import { RECENT_MATCHES } from "@/lib/team-leaders";
import type { PlayerSeason } from "@/lib/stats/types";

const HOUR = 3_600_000;
export const SQUAD_REFRESH_MS = 20 * HOUR;
const MAX_PAGES = 5;
const MAX_HITS = 12;
const SEARCH_CACHE_MS = 6 * HOUR;
const searchCache = new Map<string, { at: number; hits: TeamHit[] }>();

/** Teams we already know from the fixtures we matched, by name. */
async function knownTeams(prisma: PrismaClient, q: string): Promise<TeamHit[]> {
  const rows = await prisma.statsFixture.findMany({
    where: { provider: API_FOOTBALL, OR: [{ home: { contains: q, mode: "insensitive" } }, { away: { contains: q, mode: "insensitive" } }] },
    select: { home: true, away: true, homeTeamId: true, awayTeamId: true },
    orderBy: { kickoff: "desc" },
    take: 200,
  });
  const hits = new Map<number, TeamHit>();
  const ql = q.toLowerCase();
  for (const r of rows)
    for (const [name, id] of [[r.home, r.homeTeamId], [r.away, r.awayTeamId]] as const)
      if (id && name.toLowerCase().includes(ql) && !hits.has(id)) hits.set(id, { id, name, country: null, national: false });
  return [...hits.values()];
}

export async function searchTeams(prisma: PrismaClient, feed: ApiFootballFeed | null, q: string, now = Date.now()): Promise<TeamHit[]> {
  const known = await knownTeams(prisma, q);
  let remote: TeamHit[] = [];
  if (feed) {
    const key = q.toLowerCase();
    const cached = searchCache.get(key);
    if (cached && now - cached.at < SEARCH_CACHE_MS) remote = cached.hits;
    else {
      try {
        remote = (await feed.searchTeams(q)).data;
        searchCache.set(key, { at: now, hits: remote });
      } catch {
        remote = [];
      }
    }
  }
  const out = new Map<number, TeamHit>();
  for (const t of [...remote, ...known]) if (!out.has(t.id)) out.set(t.id, t);
  // Known teams (we have their matches) first, then national teams, then the rest.
  const knownIds = new Set(known.map((t) => t.id));
  return [...out.values()].sort((a, b) => Number(knownIds.has(b.id)) - Number(knownIds.has(a.id)) || Number(b.national) - Number(a.national)).slice(0, MAX_HITS);
}

export interface TeamSquad {
  players: PlayerSeason[];
  /** Player numbers from the team's last RECENT_MATCHES matches. */
  recent: PlayerMatch[];
  /** Kickoffs of those matches, newest first. */
  recentKickoffs: number[];
  season: number;
  /** Competitions the totals cover. */
  competitions: number;
  fetchedAt: number | null;
  error: string | null;
}

const syncId = (season: number, teamId: number) => `${API_FOOTBALL}:all:${season}:${teamId}`;

async function stored(prisma: PrismaClient, teamId: number, season: number) {
  return prisma.playerSeasonStat.findMany({ where: { provider: API_FOOTBALL, teamId, season } });
}

async function recentMatches(prisma: PrismaClient, teamId: number): Promise<{ recent: PlayerMatch[]; recentKickoffs: number[] }> {
  const fixtures = await prisma.playerMatchStat.findMany({ where: { provider: API_FOOTBALL, teamId }, select: { fixtureId: true, kickoff: true }, distinct: ["fixtureId"], orderBy: { kickoff: "desc" }, take: RECENT_MATCHES });
  const ids = fixtures.map((f) => f.fixtureId);
  const rows = ids.length ? await prisma.playerMatchStat.findMany({ where: { provider: API_FOOTBALL, teamId, fixtureId: { in: ids } } }) : [];
  return {
    recent: rows.map((r) => ({ playerId: r.playerId, name: r.name, minutes: r.minutes, shotsOn: r.shotsOn, goals: r.goals, assists: r.assists, foulsCommitted: r.foulsCommitted, foulsDrawn: r.foulsDrawn })),
    recentKickoffs: fixtures.map((f) => f.kickoff.getTime()),
  };
}

async function refresh(prisma: PrismaClient, feed: ApiFootballFeed, teamId: number, season: number, now: number): Promise<number> {
  const rows: (PlayerSeason & { leagueId: number })[] = [];
  let pages = 1;
  for (let page = 1; page <= Math.min(pages, MAX_PAGES); page++) {
    const r = await feed.teamPlayers(teamId, season, page);
    pages = r.pages;
    rows.push(...r.data);
  }
  // The team's last five matches, player by player; matches already stored are not fetched again.
  const last = (await feed.lastFixtures(teamId, RECENT_MATCHES)).data.filter((f) => f.status === "finished");
  const have = new Set((await prisma.playerMatchStat.findMany({ where: { provider: API_FOOTBALL, teamId, fixtureId: { in: last.map((f) => f.id) } }, select: { fixtureId: true }, distinct: ["fixtureId"] })).map((r) => r.fixtureId));
  for (const f of last.filter((f) => !have.has(f.id))) {
    const ps = (await feed.fixturePlayers(f.id, teamId)).data;
    await prisma.playerMatchStat.createMany({ data: ps.map((p) => ({ provider: API_FOOTBALL, fixtureId: f.id, teamId, kickoff: new Date(f.kickoff), fetchedAt: new Date(now), ...p })), skipDuplicates: true });
  }
  const key = { provider: API_FOOTBALL, season, teamId };
  await prisma.$transaction([
    prisma.playerSeasonStat.deleteMany({ where: key }),
    prisma.playerSeasonStat.createMany({ data: rows.map((p) => ({ ...key, ...p, fetchedAt: new Date(now) })), skipDuplicates: true }),
    prisma.playerStatsSync.upsert({ where: { id: syncId(season, teamId) }, create: { id: syncId(season, teamId), fetchedAt: new Date(now) }, update: { fetchedAt: new Date(now) } }),
  ]);
  return rows.length;
}

/** The team's season in every competition; fetched when missing or older than SQUAD_REFRESH_MS. Falls back to last season when this one has no minutes yet. */
export async function teamSquad(prisma: PrismaClient, feed: ApiFootballFeed | null, teamId: number, now = Date.now()): Promise<TeamSquad> {
  const current = seasonFor(now);
  let error: string | null = null;
  for (const season of [current, current - 1]) {
    const sync = await prisma.playerStatsSync.findUnique({ where: { id: syncId(season, teamId) } });
    if (feed && (!sync || now - sync.fetchedAt.getTime() >= SQUAD_REFRESH_MS)) {
      try {
        await refresh(prisma, feed, teamId, season, now);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    }
    const rows = await stored(prisma, teamId, season);
    if (rows.length) {
      const { recent, recentKickoffs } = await recentMatches(prisma, teamId);
      return {
        players: rows,
        recent,
        recentKickoffs,
        season,
        competitions: new Set(rows.map((r) => r.leagueId)).size,
        fetchedAt: Math.min(...rows.map((r) => r.fetchedAt.getTime())),
        error,
      };
    }
  }
  return { players: [], recent: [], recentKickoffs: [], season: current, competitions: 0, fetchedAt: null, error };
}
