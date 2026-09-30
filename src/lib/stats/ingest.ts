// Statistics ingestion: refreshes each covered league's fixture list, matches
// fixtures to odds-feed events, then spends a capped number of requests on
// what matters soonest: lineups near kickoff, injury lists for the next two
// days, and team statistics (including xG) for finished matches.

import type { PrismaClient } from "@/generated/prisma/client";
import { matchTeam } from "@/lib/model/teams";
import { seasonFor } from "./api-football";
import { STATS_LEAGUES } from "./leagues";
import type { StatsFeed, StatsFixture, StatsQuota } from "./types";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Lineups are usually published about an hour before kickoff. */
export const LINEUP_WINDOW_MS = 90 * MIN;
export const INJURY_WINDOW_MS = 2 * DAY;
export const INJURY_REFRESH_MS = 6 * HOUR;
export const STATS_LOOKBACK_MS = 3 * DAY;
/** A feed event and a statistics fixture are the same match when teams match and kickoffs are this close. */
const KICKOFF_TOLERANCE_MS = 3 * HOUR;

export interface StatsIngestSummary {
  runId: string;
  fixtures: number;
  matched: number;
  lineups: number;
  injuries: number;
  stats: number;
  requests: number;
  quota: StatsQuota;
  error: string | null;
}

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

export async function ingestStats(
  prisma: PrismaClient,
  feed: StatsFeed,
  opts: { oddsKeys: string[]; now?: number; budget: number; prefix?: string },
): Promise<StatsIngestSummary> {
  const now = opts.now ?? Date.now();
  const prefix = opts.prefix ?? "toa";
  const run = await prisma.ingestRun.create({ data: { provider: feed.provider, startedAt: new Date(now), sportKeys: opts.oddsKeys } });
  const s = { fixtures: 0, matched: 0, lineups: 0, injuries: 0, stats: 0, requests: 0 };
  let quota: StatsQuota = { remaining: null, limit: null };
  let error: string | null = null;
  const spend = <T>(r: { data: T; quota: StatsQuota }) => {
    s.requests++;
    quota = r.quota;
    return r.data;
  };
  const left = () => s.requests < opts.budget && (quota.remaining === null || quota.remaining > 0);

  try {
    const work: { f: StatsFixture; id: string; eventId: string }[] = [];
    for (const key of opts.oddsKeys) {
      const leagueId = STATS_LEAGUES[key];
      if (leagueId === undefined || !left()) continue;
      const fixtures = spend(await feed.fixtures(leagueId, seasonFor(now), isoDay(now - DAY), isoDay(now + 3 * DAY)));
      s.fixtures += fixtures.length;
      const events = await prisma.event.findMany({
        where: { leagueId: `${prefix}-${key}`, kickoff: { gte: new Date(now - 2 * DAY), lte: new Date(now + 4 * DAY) } },
        include: { homeTeam: true, awayTeam: true },
      });
      for (const f of fixtures) {
        const ev = events.find((e) => Math.abs(e.kickoff.getTime() - f.kickoff) <= KICKOFF_TOLERANCE_MS && matchTeam(f.home, [e.homeTeam.name]) && matchTeam(f.away, [e.awayTeam.name]));
        const id = `${feed.provider}:${f.id}`;
        const fields = { kickoff: new Date(f.kickoff), home: f.home, away: f.away, status: f.status, homeGoals: f.homeGoals, awayGoals: f.awayGoals, eventId: ev?.id ?? null, syncedAt: new Date(now) };
        await prisma.statsFixture.upsert({ where: { id }, create: { id, provider: feed.provider, leagueId, ...fields }, update: fields });
        if (ev) {
          s.matched++;
          work.push({ f, id, eventId: ev.id });
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
      for (const l of lineups) {
        const data = { team: l.team, formation: l.formation, coach: l.coach, startXI: l.startXI as object[], substitutes: l.substitutes as object[], fetchedAt: new Date(now) };
        await prisma.teamLineup.upsert({ where: { fixtureId_side: { fixtureId: w.id, side: l.side } }, create: { fixtureId: w.id, side: l.side, ...data }, update: data });
      }
      await prisma.statsFixture.update({ where: { id: w.id }, data: { lineupsAt: new Date(now) } });
      await prisma.event.update({ where: { id: w.eventId }, data: { lineupConfirmedAt: new Date(now) } });
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
  } catch (e) {
    error = e instanceof Error ? e.message.trim().split("\n").at(-1)! : String(e);
  }

  const finishedAt = new Date(now);
  await prisma.ingestRun.update({
    where: { id: run.id },
    data: { finishedAt, events: s.matched, snapshots: s.lineups + s.injuries + s.stats, results: s.stats, creditsUsed: s.requests, creditsRemaining: quota.remaining, error },
  });
  for (const [kind, label] of [["lineups", "lineups"], ["injuries", "injuries and suspensions"], ["stats", "match statistics and xG"]] as const) {
    const id = `${feed.provider}-${kind}`;
    await prisma.dataSource.upsert({
      where: { id },
      create: { id, name: `${feed.providerName} ${label}`, kind, provider: feed.providerName, status: error ? "degraded" : "ok", lastSyncAt: finishedAt },
      update: { status: error ? "degraded" : "ok", ...(error ? {} : { lastSyncAt: finishedAt }) },
    });
  }
  return { runId: run.id.toString(), ...s, quota, error };
}
