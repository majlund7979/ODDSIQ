// Statistics ingestion: refreshes each covered league's fixture list, matches
// fixtures to odds-feed events, then spends a capped number of requests on
// what matters soonest: lineups near kickoff, injury lists for the next two
// days, team statistics (including xG) for finished matches, and squad
// statistics (shots on target per player) for teams playing in the next two days.

import type { PrismaClient } from "@/generated/prisma/client";
import { matchTeam } from "@/lib/model/teams";
import { seasonFor } from "./api-football";
import { STATS_LEAGUES } from "./leagues";
import { storeLineups } from "./lineups";
import type { PlayerSeason, StatsFeed, StatsFixture, StatsQuota } from "./types";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Lineups are usually published about an hour before kickoff. */
export const LINEUP_WINDOW_MS = 90 * MIN;
export const INJURY_WINDOW_MS = 2 * DAY;
export const INJURY_REFRESH_MS = 6 * HOUR;
export const STATS_LOOKBACK_MS = 3 * DAY;
export const PLAYER_WINDOW_MS = 2 * DAY;
export const PLAYER_REFRESH_MS = 20 * HOUR;
/** Squad pages a run may fetch, so player statistics never crowd out lineups and injuries. */
export const PLAYER_PAGES_PER_RUN = 60;
const MAX_SQUAD_PAGES = 5;
/** A feed event and a statistics fixture are the same match when teams match and kickoffs are this close. */
const KICKOFF_TOLERANCE_MS = 3 * HOUR;

export interface StatsIngestSummary {
  runId: string;
  fixtures: number;
  matched: number;
  lineups: number;
  injuries: number;
  stats: number;
  /** Teams whose squad statistics were refreshed. */
  players: number;
  requests: number;
  quota: StatsQuota;
  error: string | null;
}

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Requests a run may use when the provider reports a paid daily allowance (over the free plan's 100). */
export const PAID_PLAN_BUDGET = 200;
export const FREE_PLAN_DAILY_LIMIT = 100;

/** The run's request cap: the configured budget, raised on a paid plan, which the first response's quota headers reveal. */
export function effectiveBudget(budget: number, quota: StatsQuota): number {
  return quota.limit !== null && quota.limit > FREE_PLAN_DAILY_LIMIT ? Math.max(budget, PAID_PLAN_BUDGET) : budget;
}

export async function ingestStats(
  prisma: PrismaClient,
  feed: StatsFeed,
  opts: { oddsKeys: string[]; now?: number; budget: number; prefix?: string; seasons?: Map<string, number> },
): Promise<StatsIngestSummary> {
  const now = opts.now ?? Date.now();
  const prefix = opts.prefix ?? "toa";
  const run = await prisma.ingestRun.create({ data: { provider: feed.provider, startedAt: new Date(now), sportKeys: opts.oddsKeys } });
  const s = { fixtures: 0, matched: 0, lineups: 0, injuries: 0, stats: 0, players: 0, requests: 0 };
  let quota: StatsQuota = { remaining: null, limit: null };
  let error: string | null = null;
  const spend = <T>(r: { data: T; quota: StatsQuota }) => {
    s.requests++;
    quota = r.quota;
    return r.data;
  };
  const left = () => s.requests < effectiveBudget(opts.budget, quota) && (quota.remaining === null || quota.remaining > 0);

  try {
    const work: { f: StatsFixture; id: string; eventId: string; season: number }[] = [];
    for (const key of opts.oddsKeys) {
      const leagueId = STATS_LEAGUES[key];
      if (leagueId === undefined || !left()) continue;
      // Internationals and calendar-year leagues name their seasons differently; the odds feed knows the current one.
      const season = opts.seasons?.get(key) ?? seasonFor(now);
      const fixtures = spend(await feed.fixtures(leagueId, season, isoDay(now - DAY), isoDay(now + 3 * DAY)));
      s.fixtures += fixtures.length;
      const events = await prisma.event.findMany({
        where: { leagueId: `${prefix}-${key}`, kickoff: { gte: new Date(now - 2 * DAY), lte: new Date(now + 4 * DAY) } },
        include: { homeTeam: true, awayTeam: true },
      });
      for (const f of fixtures) {
        const ev = events.find((e) => Math.abs(e.kickoff.getTime() - f.kickoff) <= KICKOFF_TOLERANCE_MS && matchTeam(f.home, [e.homeTeam.name]) && matchTeam(f.away, [e.awayTeam.name]));
        const id = `${feed.provider}:${f.id}`;
        const fields = { kickoff: new Date(f.kickoff), home: f.home, away: f.away, status: f.status, homeGoals: f.homeGoals, awayGoals: f.awayGoals, referee: f.referee ?? null, homeTeamId: f.homeId ?? null, awayTeamId: f.awayId ?? null, eventId: ev?.id ?? null, syncedAt: new Date(now) };
        await prisma.statsFixture.upsert({ where: { id }, create: { id, provider: feed.provider, leagueId, ...fields }, update: fields });
        if (ev) {
          s.matched++;
          work.push({ f, id, eventId: ev.id, season });
        }
      }
    }

    const stored = new Map((await prisma.statsFixture.findMany({ where: { id: { in: work.map((w) => w.id) } } })).map((r) => [r.id, r]));
    const until = (w: (typeof work)[number]) => w.f.kickoff - now;
    const lineupJobs = work.filter((w) => w.f.status !== "finished" && until(w) <= LINEUP_WINDOW_MS && until(w) > -3 * HOUR && !stored.get(w.id)?.lineupsAt);
    const injuryJobs = work.filter((w) => w.f.status === "scheduled" && until(w) > 0 && until(w) <= INJURY_WINDOW_MS && now - (stored.get(w.id)?.injuriesAt?.getTime() ?? 0) >= INJURY_REFRESH_MS);
    const statsJobs = work.filter((w) => w.f.status === "finished" && until(w) > -STATS_LOOKBACK_MS && !stored.get(w.id)?.statsAt);
    const byKickoff = (a: (typeof work)[number], b: (typeof work)[number]) => a.f.kickoff - b.f.kickoff;

    for (const w of lineupJobs.sort(byKickoff)) {
      if (!left()) break;
      const lineups = spend(await feed.lineups(w.f));
      if (lineups.length < 2) continue; // not published yet; tried again next run
      await storeLineups(prisma, w.id, w.eventId, lineups, now);
      s.lineups++;
    }
    for (const w of injuryJobs.sort(byKickoff)) {
      if (!left()) break;
      const items = spend(await feed.injuries(w.f));
      await prisma.$transaction([
        prisma.injuryReport.deleteMany({ where: { fixtureId: w.id } }),
        prisma.injuryReport.createMany({ data: items.map((i) => ({ fixtureId: w.id, side: i.side, team: i.team, player: i.player, status: i.status, reason: i.reason, fetchedAt: new Date(now) })) }),
        prisma.statsFixture.update({ where: { id: w.id }, data: { injuriesAt: new Date(now) } }),
      ]);
      s.injuries++;
    }
    for (const w of statsJobs.sort(byKickoff).reverse()) {
      if (!left()) break;
      const teams = spend(await feed.statistics(w.f));
      const home = teams.find((t) => t.side === "home");
      const away = teams.find((t) => t.side === "away");
      if (!home || !away) continue;
      const stats = Object.fromEntries(teams.map((t) => [t.side, { shots: t.shots, shotsOnTarget: t.shotsOnTarget, possession: t.possession }]));
      await prisma.statsFixture.update({ where: { id: w.id }, data: { homeXg: home.xg, awayXg: away.xg, stats, statsAt: new Date(now) } });
      s.stats++;
    }

    // Squad statistics: each team once a day while it has a match coming up.
    if (feed.players) {
      const teams = new Map<string, { teamId: number; leagueId: number; season: number; kickoff: number }>();
      for (const w of work)
        if (w.f.status === "scheduled" && until(w) > 0 && until(w) <= PLAYER_WINDOW_MS)
          for (const teamId of [w.f.homeId, w.f.awayId])
            if (teamId) teams.set(`${feed.provider}:${w.f.leagueId}:${w.season}:${teamId}`, { teamId, leagueId: w.f.leagueId, season: w.season, kickoff: w.f.kickoff });
      const synced = new Map((await prisma.playerStatsSync.findMany({ where: { id: { in: [...teams.keys()] } } })).map((r) => [r.id, r.fetchedAt.getTime()]));
      let pages = 0;
      for (const [id, team] of [...teams.entries()].filter(([id]) => now - (synced.get(id) ?? 0) >= PLAYER_REFRESH_MS).sort((a, b) => a[1].kickoff - b[1].kickoff)) {
        const squad: PlayerSeason[] = [];
        let total = 1;
        let page = 1;
        for (; page <= Math.min(total, MAX_SQUAD_PAGES); page++) {
          if (!left() || pages >= PLAYER_PAGES_PER_RUN) break;
          const r = await feed.players(team.teamId, team.leagueId, team.season, page);
          spend(r);
          pages++;
          total = r.pages;
          squad.push(...r.data);
        }
        // Out of budget halfway through a squad: keep the old totals and try again next run.
        if (page <= Math.min(total, MAX_SQUAD_PAGES)) break;
        const key = { provider: feed.provider, leagueId: team.leagueId, season: team.season, teamId: team.teamId };
        await prisma.$transaction([
          prisma.playerSeasonStat.deleteMany({ where: key }),
          prisma.playerSeasonStat.createMany({ data: squad.map((p) => ({ ...key, ...p, fetchedAt: new Date(now) })), skipDuplicates: true }),
          prisma.playerStatsSync.upsert({ where: { id }, create: { id, fetchedAt: new Date(now) }, update: { fetchedAt: new Date(now) } }),
        ]);
        s.players++;
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message.trim().split("\n").at(-1)! : String(e);
  }

  const finishedAt = new Date(now);
  await prisma.ingestRun.update({
    where: { id: run.id },
    data: { finishedAt, events: s.matched, snapshots: s.lineups + s.injuries + s.stats + s.players, results: s.stats, creditsUsed: s.requests, creditsRemaining: quota.remaining, error },
  });
  for (const [kind, label] of [["lineups", "lineups"], ["injuries", "injuries and suspensions"], ["stats", "match statistics and xG"], ["players", "player statistics"]] as const) {
    const id = `${feed.provider}-${kind}`;
    await prisma.dataSource.upsert({
      where: { id },
      create: { id, name: `${feed.providerName} ${label}`, kind, provider: feed.providerName, status: error ? "degraded" : "ok", lastSyncAt: finishedAt },
      update: { status: error ? "degraded" : "ok", ...(error ? {} : { lastSyncAt: finishedAt }) },
    });
  }
  return { runId: run.id.toString(), ...s, quota, error };
}
