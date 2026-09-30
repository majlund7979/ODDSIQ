// Odds ingestion: pulls prices and results from a licensed feed into Postgres.
// Feed data lives beside the demo universe under its own id namespace
// ("toa-…" for The Odds API) and is never mixed with DEMO DATA.
//
// Every run stores one OddsSnapshot per bookmaker price for events that have
// not kicked off, so the last snapshot at or before kickoff is the closing
// line (see closing.ts). Prices for events already in play go to InPlayOdds,
// and every score the feed reports goes to ScoreUpdate, so the Live and
// Market Replay pages can show them without touching pre-match analytics.

import type { PrismaClient } from "@/generated/prisma/client";
import { overround } from "@/lib/metrics/probability";
import { settle } from "./closing";
import type { FeedCompetition, FeedEvent, FeedMarketType, FeedQuota, OddsFeed } from "./types";

const DAY = 86_400_000;
const SPORT_NAMES: Record<string, string> = { football: "Football", basketball: "Basketball", tennis: "Tennis", "american-football": "American Football", "ice-hockey": "Ice Hockey" };
const MARKET_NAMES: Record<FeedMarketType, string> = { "1X2": "Match Winner", ML: "Moneyline", OU25: "Total Goals 2.5" };
const MARKET_SELECTIONS: Record<FeedMarketType, string[]> = { "1X2": ["home", "draw", "away"], ML: ["home", "away"], OU25: ["over", "under"] };

export const slug = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function feedIds(prefix: string, e: { externalId: string; competitionKey: string; home: string; away: string }) {
  const leagueId = `${prefix}-${e.competitionKey}`;
  const eventId = `${prefix}-${e.externalId}`;
  return {
    leagueId,
    eventId,
    homeTeamId: `${leagueId}-${slug(e.home)}`,
    awayTeamId: `${leagueId}-${slug(e.away)}`,
    marketId: (m: FeedMarketType) => `${eventId}-${m.toLowerCase()}`,
    selectionId: (m: FeedMarketType, sel: string) => `${eventId}-${m.toLowerCase()}-${sel}`,
  };
}

function selectionName(m: FeedMarketType, sel: string, e: FeedEvent): string {
  if (sel === "home") return e.home;
  if (sel === "away") return e.away;
  if (sel === "draw") return "Draw";
  return m === "OU25" ? `${sel === "over" ? "Over" : "Under"} 2.5` : sel;
}

/** Average overround per bookmaker across the complete markets in this batch. */
export function bookMargins(events: FeedEvent[]): Map<string, number> {
  const acc = new Map<string, number[]>();
  for (const e of events) {
    const groups = new Map<string, number[]>();
    for (const p of e.prices) {
      const k = `${p.bookmakerKey}|${p.market}`;
      groups.set(k, [...(groups.get(k) ?? []), p.odds]);
    }
    for (const [k, odds] of groups) {
      const [book, market] = k.split("|") as [string, FeedMarketType];
      if (odds.length === MARKET_SELECTIONS[market].length) acc.set(book, [...(acc.get(book) ?? []), overround(odds)]);
    }
  }
  return new Map([...acc].map(([b, xs]) => [b, xs.reduce((a, c) => a + c, 0) / xs.length]));
}

export interface IngestOptions {
  competitionKeys: string[];
  now?: number;
  /** Id prefix for everything this feed creates. */
  prefix?: string;
  /** "live" for the in-play runs of /api/cron/live. */
  kind?: "scheduled" | "live";
}

export interface IngestSummary {
  runId: string;
  competitions: string[];
  events: number;
  snapshots: number;
  inPlay: number;
  scores: number;
  results: number;
  quota: FeedQuota | null;
  error: string | null;
}

export async function ingest(prisma: PrismaClient, feed: OddsFeed, opts: IngestOptions): Promise<IngestSummary> {
  const now = opts.now ?? Date.now();
  const prefix = opts.prefix ?? "toa";
  const run = await prisma.ingestRun.create({ data: { provider: feed.provider, kind: opts.kind ?? "scheduled", startedAt: new Date(now), sportKeys: opts.competitionKeys } });
  let quota: FeedQuota | null = null;
  let events = 0;
  let snapshots = 0;
  let inPlay = 0;
  let scores = 0;
  let results = 0;
  let error: string | null = null;

  try {
    const comps = await feed.competitions();
    quota = comps.quota.remaining !== null ? comps.quota : quota;
    const byKey = new Map<string, FeedCompetition>(comps.data.map((c) => [c.key, c]));
    const unknown = opts.competitionKeys.filter((k) => !byKey.has(k));
    if (unknown.length) throw new Error(`Unknown competition key(s): ${unknown.join(", ")}. See the provider's sports list.`);

    for (const key of opts.competitionKeys) {
      const comp = byKey.get(key)!;
      const sportId = comp.sportId;
      const leagueId = `${prefix}-${key}`;
      await prisma.sport.upsert({ where: { id: sportId }, create: { id: sportId, name: SPORT_NAMES[sportId] ?? comp.group }, update: {} });
      await prisma.league.upsert({ where: { id: leagueId }, create: { id: leagueId, sportId, name: comp.name, country: "" }, update: { name: comp.name } });

      const odds = await feed.odds(key);
      quota = odds.quota;
      const margins = bookMargins(odds.data);
      for (const [book, margin] of margins) {
        const name = odds.data.flatMap((e) => e.prices).find((p) => p.bookmakerKey === book)!.bookmakerName;
        // Reliability is not measured for feed bookmakers yet; 0 marks it as unknown.
        await prisma.bookmaker.upsert({ where: { id: `${prefix}-${book}` }, create: { id: `${prefix}-${book}`, name, margin, reliability: 0 }, update: { name, margin } });
      }

      for (const e of odds.data) {
        const ids = feedIds(prefix, e);
        for (const [teamId, name] of [[ids.homeTeamId, e.home], [ids.awayTeamId, e.away]] as const) {
          await prisma.team.upsert({ where: { id: teamId }, create: { id: teamId, leagueId, name, shortName: name.slice(0, 3).toUpperCase() }, update: {} });
        }
        const existing = await prisma.event.findUnique({ where: { id: ids.eventId }, select: { status: true } });
        if (existing?.status === "finished") continue;
        const status = now >= e.kickoff ? "live" : "scheduled";
        await prisma.event.upsert({
          where: { id: ids.eventId },
          create: { id: ids.eventId, externalId: `${prefix}:${e.externalId}`, sportId, leagueId, homeTeamId: ids.homeTeamId, awayTeamId: ids.awayTeamId, kickoff: new Date(e.kickoff), status },
          // Kickoff times can move.
          update: { kickoff: new Date(e.kickoff), status },
        });
        events++;

        const marketTypes = [...new Set(e.prices.map((p) => p.market))];
        for (const m of marketTypes) {
          await prisma.market.upsert({ where: { id: ids.marketId(m) }, create: { id: ids.marketId(m), eventId: ids.eventId, type: m, name: MARKET_NAMES[m] }, update: {} });
          for (const sel of MARKET_SELECTIONS[m]) {
            await prisma.selection.upsert({ where: { id: ids.selectionId(m, sel) }, create: { id: ids.selectionId(m, sel), marketId: ids.marketId(m), eventId: ids.eventId, name: selectionName(m, sel, e) }, update: {} });
          }
        }
        const rows = e.prices.map((p) => ({ selectionId: ids.selectionId(p.market, p.selection), bookmakerId: `${prefix}-${p.bookmakerKey}`, observedAt: new Date(now), odds: p.odds, sourceId: feed.provider }));
        if (!rows.length) continue;
        if (now >= e.kickoff) {
          await prisma.inPlayOdds.createMany({ data: rows });
          inPlay += rows.length;
        } else {
          await prisma.oddsSnapshot.createMany({ data: rows });
          snapshots += rows.length;
        }
      }

      // Results cost credits, so only ask when a stored event has kicked off and is unsettled.
      const pending = await prisma.event.count({ where: { leagueId, status: { not: "finished" }, kickoff: { lt: new Date(now), gt: new Date(now - 3 * DAY) } } });
      if (pending > 0) {
        const res = await feed.results(key, 3);
        quota = res.quota;
        for (const r of res.data) {
          if (r.homeScore === null || r.awayScore === null || r.kickoff > now) continue;
          const ids = feedIds(prefix, r);
          const ev = await prisma.event.findUnique({ where: { id: ids.eventId }, select: { status: true, markets: { select: { type: true, selections: { select: { id: true } } } } } });
          if (!ev || ev.status === "finished") continue;
          await prisma.scoreUpdate.create({ data: { eventId: ids.eventId, observedAt: new Date(now), homeScore: r.homeScore, awayScore: r.awayScore, completed: r.completed } });
          scores++;
          if (!r.completed) continue;
          await prisma.event.update({ where: { id: ids.eventId }, data: { status: "finished", homeScore: r.homeScore, awayScore: r.awayScore } });
          for (const m of ev.markets) {
            for (const sel of MARKET_SELECTIONS[m.type as FeedMarketType] ?? []) {
              await prisma.selection.update({ where: { id: ids.selectionId(m.type as FeedMarketType, sel) }, data: { result: settle(m.type, sel, r.homeScore, r.awayScore) } });
            }
          }
          results++;
        }
      }
    }
  } catch (e) {
    // Keep the last line: database errors carry a long code excerpt before the cause.
    error = (e instanceof Error ? e.message : String(e)).trim().split("\n").at(-1)!.slice(0, 500);
  }

  const finishedAt = new Date();
  await prisma.ingestRun.update({
    where: { id: run.id },
    data: { finishedAt, events, snapshots, results, creditsUsed: quota?.used ?? null, creditsRemaining: quota?.remaining ?? null, error },
  });
  await prisma.dataSource.upsert({
    where: { id: feed.provider },
    create: { id: feed.provider, name: `${feed.providerName} odds`, kind: "odds", provider: feed.providerName, status: error ? "degraded" : "ok", lastSyncAt: finishedAt },
    update: { status: error ? "degraded" : "ok", ...(error ? {} : { lastSyncAt: finishedAt }) },
  });
  return { runId: run.id.toString(), competitions: opts.competitionKeys, events, snapshots, inPlay, scores, results, quota, error };
}

/** A football match, half-time and stoppage included, is over well within this. */
export const IN_PLAY_WINDOW_MS = 150 * 60_000;

/** Configured competitions with a stored feed event in play: kicked off within the in-play window and not finished. */
export async function inPlayCompetitions(prisma: PrismaClient, competitionKeys: string[], now: number, prefix = "toa"): Promise<string[]> {
  const rows = await prisma.event.findMany({
    where: { externalId: { startsWith: `${prefix}:` }, status: { not: "finished" }, kickoff: { lte: new Date(now), gt: new Date(now - IN_PLAY_WINDOW_MS) } },
    select: { leagueId: true },
    distinct: ["leagueId"],
  });
  const live = new Set(rows.map((r) => r.leagueId));
  return competitionKeys.filter((k) => live.has(`${prefix}-${k}`));
}
