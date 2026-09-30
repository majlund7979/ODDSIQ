// Read model over live feed data (DEMO_MODE=false). Produces the same row
// shapes as the demo store so the terminal pages render either. Prices are
// the snapshots stored by each ingestion run; model probabilities are the
// real model's current estimate, or the recorded ledger prediction once one
// exists. Nothing here is simulated.

import type { PrismaClient } from "@/generated/prisma/client";
import type { EventStatus, Prediction, SportEvent, SportId } from "@/lib/domain/types";
import { verifyChain } from "@/lib/ledger/hash";
import { clv } from "@/lib/metrics/clv";
import { modelConsensus } from "@/lib/metrics/consensus";
import { marketPressure, velocityLevel, volatility as seriesVolatility } from "@/lib/metrics/movement";
import { dataQuality } from "@/lib/metrics/quality";
import { edgePp, expectedValue } from "@/lib/metrics/value";
import { REAL_MODEL, type MatchForecast } from "@/lib/model/ensemble";
import { explainSelection } from "@/lib/model/explain";
import { buildLeagueModel, forecastFor, type LeagueModel } from "@/lib/model/league-model";
import { leagueForOddsKey, OPENFOOTBALL_SOURCE } from "@/lib/model/openfootball";
import { loadResults } from "@/lib/model/pipeline";
import { closingLine, type PricePoint as BookPoint } from "@/lib/providers/closing";
import type { LedgerAudit, LedgerRow, MarketDetail, MarketRow, MatchView } from "@/lib/demo/store";
import { teamNews, type StoredFixture, type TeamNews } from "@/lib/stats/news";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** A bookmaker's price counts as current for this long after it was observed (runs are six hours apart). */
const PRICE_WINDOW_MS = 12 * HOUR;
/** Finished matches stay visible for a week (Matches → Results). */
const LOOKBACK_MS = 7 * DAY;
const LOOKAHEAD_MS = 10 * DAY;
const CACHE_MS = 60_000;

export type EventView = SportEvent & { homeName: string; awayName: string; leagueName: string; sportName: string };

export interface SourceView {
  id: string;
  name: string;
  kind: "odds" | "stats" | "lineups" | "injuries";
  status: "ok" | "degraded" | "down";
  lastSyncAt: number;
  provider: string;
}

interface MarketData {
  id: string;
  type: string;
  name: string;
  selections: { id: string; name: string; side: string; result: string | null }[];
  points: BookPoint[];
  runs: number[];
}

interface EventData {
  view: EventView;
  oddsKey: string;
  markets: MarketData[];
  forecast: { f: MatchForecast; home: string; away: string } | { reason: string } | null;
  model: LeagueModel | null;
  news: TeamNews | null;
}

export interface RealSnapshot {
  now: number;
  events: EventData[];
  rows: MarketRow[];
  ledger: LedgerRow[];
  audit: LedgerAudit;
  sources: SourceView[];
  books: Map<string, string>;
  predictionsBySelection: Map<string, Prediction>;
  models: Map<string, LeagueModel>;
}

const SPORT_NAMES: Record<string, string> = { football: "Football", basketball: "Basketball", tennis: "Tennis", "american-football": "American Football", "ice-hockey": "Ice Hockey" };
const side = (selectionId: string) => selectionId.slice(selectionId.lastIndexOf("-") + 1);
const oddsKeyOf = (leagueId: string) => leagueId.slice(leagueId.indexOf("-") + 1);

/** Each book's latest price per selection observed in (at − window, at]. */
function latestByBook(points: BookPoint[], at: number, window = PRICE_WINDOW_MS): Map<string, Map<string, number>> {
  const best = new Map<string, BookPoint>();
  for (const p of points) {
    if (p.observedAt > at || p.observedAt <= at - window) continue;
    const k = `${p.bookmakerId}|${p.selectionId}`;
    const prev = best.get(k);
    if (!prev || p.observedAt > prev.observedAt) best.set(k, p);
  }
  const out = new Map<string, Map<string, number>>();
  for (const p of best.values()) {
    if (!out.has(p.selectionId)) out.set(p.selectionId, new Map());
    out.get(p.selectionId)!.set(p.bookmakerId, p.odds);
  }
  return out;
}

function consensusAt(m: MarketData, at: number) {
  const line = closingLine(m.points, m.selections.map((s) => s.id), at, PRICE_WINDOW_MS);
  return line;
}

const modelCache = new Map<string, { hour: number; model: LeagueModel }>();

async function leagueModel(prisma: PrismaClient, code: string, now: number): Promise<LeagueModel> {
  const hour = Math.floor(now / HOUR);
  const hit = modelCache.get(code);
  if (hit && hit.hour === hour) return hit.model;
  const model = buildLeagueModel(await loadResults(prisma, code, now), now);
  modelCache.set(code, { hour, model });
  return model;
}

function toPrediction(p: { id: string; seq: number; createdAt: Date; eventId: string; marketId: string; selectionId: string; modelVersionId: string; probability: number; ciLow: number; ciHigh: number; confidence: number; odds: unknown; bookmakerId: string; prevHash: string; hash: string }): Prediction {
  return { ...p, createdAt: p.createdAt.getTime(), odds: Number(p.odds) };
}

function buildRow(e: EventData, m: MarketData, i: number, now: number, books: Map<string, string>, prediction: Prediction | undefined): MarketRow | null {
  const sel = m.selections[i];
  const ref = Math.min(now, e.view.kickoff);
  const runs = m.runs.filter((r) => r <= ref);
  if (!runs.length) return null;
  const last = runs.at(-1)!;
  const current = consensusAt(m, last);
  const opening = consensusAt(m, runs[0]);
  const mine = current?.selections[i];
  if (!current || !mine || !opening) return null;
  const quotes = latestByBook(m.points, last).get(sel.id) ?? new Map<string, number>();
  let bestBookId = "";
  let bestOdds = 0;
  for (const [b, o] of quotes) if (o > bestOdds) [bestOdds, bestBookId] = [o, b];
  const openingOdds = opening.selections[i].medianOdds;
  const currentOdds = mine.medianOdds;
  const series = runs.map((r) => ({ at: r, odds: consensusAt(m, r)?.selections[i].medianOdds ?? NaN })).filter((p) => !Number.isNaN(p.odds));
  const prev = [...series].reverse().find((p) => p.at <= last - 5 * HOUR) ?? series[0];
  const hours = (last - prev.at) / HOUR;
  const velocityPerHour = hours > 0 ? (currentOdds - prev.odds) / hours : 0;
  const relativeVelocityPerHour = hours > 0 ? (currentOdds / prev.odds - 1) / hours : 0;
  const booksMovedSince = (from: number) => {
    const dir = Math.sign(currentOdds - (consensusAt(m, from)?.selections[i].medianOdds ?? currentOdds)) || 1;
    const then = latestByBook(m.points, from, Infinity).get(sel.id) ?? new Map<string, number>();
    let moving = 0;
    for (const [b, o] of quotes) {
      const t = then.get(b);
      if (t !== undefined && Math.sign(o - t) === dir && Math.abs(o / t - 1) > 0.01) moving++;
    }
    return moving;
  };
  const vol = seriesVolatility(series);
  const hoursToKickoff = (e.view.kickoff - ref) / HOUR;
  const tracked = new Set(m.points.map((p) => p.bookmakerId)).size;

  const fc = e.forecast && "f" in e.forecast ? e.forecast.f.selections.find((s) => s.market === m.type && s.selection === sel.side) : undefined;
  const p = prediction?.probability ?? fc?.probability ?? null;
  const spread = fc && fc.components.elo !== null ? modelConsensus([fc.components.poisson, fc.components.elo]) : null;
  return {
    selectionId: sel.id,
    eventId: e.view.id,
    marketId: m.id,
    sportId: e.view.sportId,
    leagueId: e.view.leagueId,
    marketType: m.type as MarketRow["marketType"],
    side: sel.side,
    sport: e.view.sportName,
    league: e.view.leagueName,
    match: `${e.view.homeName} vs ${e.view.awayName}`,
    kickoff: e.view.kickoff,
    status: e.view.status,
    market: m.name,
    selection: sel.name,
    bestOdds,
    bestBook: books.get(bestBookId) ?? bestBookId,
    bestBookId: bestBookId || null,
    openingOdds,
    currentOdds,
    openingFavourite: openingOdds <= Math.min(...opening.selections.map((s) => s.medianOdds)),
    volatility: vol,
    marketProbability: mine.fairProbability,
    modelProbability: p,
    ciLow: prediction?.ciLow ?? fc?.ciLow ?? null,
    ciHigh: prediction?.ciHigh ?? fc?.ciHigh ?? null,
    modelVersion: p === null ? null : REAL_MODEL.ensemble.id,
    inPlayModel: false,
    edgePp: p === null ? null : edgePp(p, mine.fairProbability),
    ev: p === null || !bestOdds ? null : expectedValue(p, bestOdds),
    movement: currentOdds / openingOdds - 1,
    velocityPerHour,
    relativeVelocityPerHour,
    velocityLevel: velocityLevel(relativeVelocityPerHour),
    pressure: marketPressure({
      openOdds: openingOdds,
      currentOdds,
      relativeVelocityPerHour,
      booksMovingWithConsensus: booksMovedSince(Math.max(runs[0], last - 6 * HOUR)),
      booksQuoting: quotes.size,
      volatility: vol,
      baselineVolatility: 0.012,
      hoursToKickoff,
    }),
    confidence: prediction?.confidence ?? fc?.confidence ?? null,
    modelDisagreement: spread?.level ?? null,
    modelStdevPp: spread?.stdevPp ?? (fc ? 0 : null),
    dataQuality: dataQuality({
      now: ref,
      oddsUpdatedAt: last,
      statsUpdatedAt: e.model?.dataThrough ?? undefined,
      injuriesUpdatedAt: e.news?.injuriesAt ?? undefined,
      lineupConfirmedAt: e.view.lineupConfirmedAt,
      hoursToKickoff,
      sourceReliability: 0.9,
      booksQuoting: quotes.size,
      booksTracked: tracked,
    }),
    booksQuoting: quotes.size,
    booksMoving: booksMovedSince(Math.max(runs[0], last - 6 * HOUR)),
    booksMovedSinceOpen: booksMovedSince(runs[0]),
    lastUpdate: last,
  };
}

let cache: { key: number; snap: RealSnapshot } | null = null;

export async function realSnapshot(prisma: PrismaClient, now: number): Promise<RealSnapshot> {
  const key = Math.floor(now / CACHE_MS);
  if (cache?.key === key) return cache.snap;

  const events = await prisma.event.findMany({
    where: { externalId: { not: null }, kickoff: { gte: new Date(now - LOOKBACK_MS), lte: new Date(now + LOOKAHEAD_MS) } },
    orderBy: { kickoff: "asc" },
    include: {
      league: true,
      homeTeam: true,
      awayTeam: true,
      markets: { include: { selections: { orderBy: { id: "asc" } } } },
      statsFixtures: { include: { lineups: true, injuries: true }, orderBy: { syncedAt: "desc" }, take: 1 },
    },
  });
  // Recent xG for form lines; small, since only fixtures near feed events are stored.
  const xgHistory: StoredFixture[] = await prisma.statsFixture.findMany({
    where: { homeXg: { not: null }, kickoff: { gte: new Date(now - 120 * DAY), lt: new Date(now + LOOKAHEAD_MS) } },
    include: { lineups: true, injuries: true },
  });
  const selectionIds = events.flatMap((e) => e.markets.flatMap((m) => m.selections.map((s) => s.id)));
  const snaps = selectionIds.length
    ? await prisma.oddsSnapshot.findMany({ where: { selectionId: { in: selectionIds } }, select: { selectionId: true, bookmakerId: true, observedAt: true, odds: true } })
    : [];
  const bySelection = new Map<string, BookPoint[]>();
  for (const s of snaps) {
    const p = { selectionId: s.selectionId, bookmakerId: s.bookmakerId, observedAt: s.observedAt.getTime(), odds: Number(s.odds) };
    if (!bySelection.has(p.selectionId)) bySelection.set(p.selectionId, []);
    bySelection.get(p.selectionId)!.push(p);
  }
  const bookRows = await prisma.bookmaker.findMany({ where: { id: { in: [...new Set(snaps.map((s) => s.bookmakerId))] } } });
  const books = new Map(bookRows.map((b) => [b.id, b.name]));

  const models = new Map<string, LeagueModel>();
  for (const code of new Set(events.map((e) => leagueForOddsKey(oddsKeyOf(e.leagueId))?.code).filter((c): c is string => Boolean(c)))) {
    models.set(code, await leagueModel(prisma, code, now));
  }

  const order = (s: string) => ["home", "draw", "away", "over", "under", "yes", "no"].indexOf(s);
  const data: EventData[] = events.map((e) => {
    const league = leagueForOddsKey(oddsKeyOf(e.leagueId));
    const model = league ? (models.get(league.code) ?? null) : null;
    const r = model && league && e.status === "scheduled" ? forecastFor(model, e.homeTeam.name, e.awayTeam.name, league.name) : null;
    const status: EventStatus = e.status === "scheduled" && e.kickoff.getTime() <= now ? "live" : (e.status as EventStatus);
    return {
      view: {
        id: e.id,
        sportId: e.sportId as SportId,
        leagueId: e.leagueId,
        homeTeamId: e.homeTeamId,
        awayTeamId: e.awayTeamId,
        kickoff: e.kickoff.getTime(),
        status,
        score: e.homeScore !== null && e.awayScore !== null ? { home: e.homeScore, away: e.awayScore } : undefined,
        homeName: e.homeTeam.name,
        awayName: e.awayTeam.name,
        leagueName: e.league.name,
        sportName: SPORT_NAMES[e.sportId] ?? e.sportId,
        lineupConfirmedAt: e.lineupConfirmedAt?.getTime(),
      },
      oddsKey: oddsKeyOf(e.leagueId),
      model,
      news: e.statsFixtures[0] ? teamNews(e.statsFixtures[0], xgHistory) : null,
      forecast: r ? (r.ok ? { f: r.forecast, home: r.home, away: r.away } : { reason: r.reason }) : null,
      markets: e.markets.map((m) => {
        const sels = [...m.selections].sort((a, b) => order(side(a.id)) - order(side(b.id)));
        const points = sels.flatMap((s) => bySelection.get(s.id) ?? []);
        return {
          id: m.id,
          type: m.type,
          name: m.name,
          selections: sels.map((s) => ({ id: s.id, name: s.name, side: side(s.id), result: s.result })),
          points,
          runs: [...new Set(points.map((p) => p.observedAt))].sort((a, b) => a - b),
        };
      }),
    };
  });

  // The ledger: every recorded real-model prediction, plus chain verification over the whole table.
  const chain = (await prisma.prediction.findMany({ orderBy: { seq: "asc" } })).map(toPrediction);
  const real = chain.filter((p) => p.modelVersionId === REAL_MODEL.ensemble.id);
  const predictionsBySelection = new Map(real.map((p) => [p.selectionId, p]));

  const rows: MarketRow[] = [];
  for (const e of data) {
    if (e.view.status !== "scheduled") continue;
    for (const m of e.markets) m.selections.forEach((_, i) => {
      const r = buildRow(e, m, i, now, books, predictionsBySelection.get(m.selections[i].id));
      if (r) rows.push(r);
    });
  }

  const ledger = await ledgerRows(prisma, real, books);
  const missing = await prisma.missingPrediction.findMany({ orderBy: { kickoff: "desc" }, take: 200 });
  const feedEvents = new Set((await prisma.event.findMany({ where: { id: { in: missing.map((x) => x.eventId) }, externalId: { not: null } }, select: { id: true } })).map((e) => e.id));
  const versions = new Map<string, { firstSeenAt: number; count: number }>();
  for (const p of real) {
    const v = versions.get(p.modelVersionId);
    if (v) v.count++;
    else versions.set(p.modelVersionId, { firstSeenAt: p.createdAt, count: 1 });
  }
  const verification = verifyChain(chain);
  const audit: LedgerAudit = {
    verification,
    count: real.length,
    headHash: chain.at(-1)?.hash ?? null,
    firstAt: real[0]?.createdAt ?? null,
    lastAt: real.at(-1)?.createdAt ?? null,
    missing: missing.filter((x) => feedEvents.has(x.eventId)).map((x) => ({ eventId: x.eventId, marketId: x.marketId, reason: x.reason, kickoff: x.kickoff.getTime() })),
    changed: verification.ok ? 0 : 1,
    deleted: 0,
    versionChanges: [...versions.entries()].map(([versionId, v]) => ({ versionId, ...v })),
  };

  const feeds = await prisma.dataSource.findMany();
  const through = Math.max(0, ...[...models.values()].map((m) => m.dataThrough ?? 0));
  const sources: SourceView[] = [
    ...feeds.map((s) => ({ id: s.id, name: s.name, kind: s.kind as SourceView["kind"], status: s.status as SourceView["status"], lastSyncAt: s.lastSyncAt.getTime(), provider: s.provider })),
    ...(through ? [{ id: "openfootball", name: "Match results", kind: "stats" as const, status: "ok" as const, lastSyncAt: through, provider: OPENFOOTBALL_SOURCE }] : []),
  ];

  const snap: RealSnapshot = { now, events: data, rows, ledger, audit, sources, books, predictionsBySelection, models };
  cache = { key, snap };
  return snap;
}

async function ledgerRows(prisma: PrismaClient, preds: Prediction[], books: Map<string, string>): Promise<LedgerRow[]> {
  if (!preds.length) return [];
  const outcomes = new Map((await prisma.predictionOutcome.findMany({ where: { predictionId: { in: preds.map((p) => p.id) } } })).map((o) => [o.predictionId, o]));
  const events = new Map(
    (await prisma.event.findMany({ where: { id: { in: [...new Set(preds.map((p) => p.eventId))] } }, include: { league: true, homeTeam: true, awayTeam: true, markets: { include: { selections: true } } } })).map((e) => [e.id, e]),
  );
  const marketIds = [...new Set(preds.map((p) => p.marketId))];
  const snaps = await prisma.oddsSnapshot.findMany({ where: { selection: { marketId: { in: marketIds } } }, select: { selectionId: true, bookmakerId: true, observedAt: true, odds: true, selection: { select: { marketId: true } } } });
  const byMarket = new Map<string, BookPoint[]>();
  for (const s of snaps) {
    const k = s.selection.marketId;
    if (!byMarket.has(k)) byMarket.set(k, []);
    byMarket.get(k)!.push({ selectionId: s.selectionId, bookmakerId: s.bookmakerId, observedAt: s.observedAt.getTime(), odds: Number(s.odds) });
  }
  const missingBooks = [...new Set(preds.map((p) => p.bookmakerId))].filter((b) => !books.has(b));
  for (const b of await prisma.bookmaker.findMany({ where: { id: { in: missingBooks } } })) books.set(b.id, b.name);

  return preds.flatMap((p) => {
    const e = events.get(p.eventId);
    const m = e?.markets.find((x) => x.id === p.marketId);
    const s = m?.selections.find((x) => x.id === p.selectionId);
    if (!e || !m || !s) return [];
    const ids = m.selections.map((x) => x.id);
    const at = closingLine(byMarket.get(m.id) ?? [], ids, p.createdAt, PRICE_WINDOW_MS);
    const o = outcomes.get(p.id);
    const result = (o?.result ?? undefined) as LedgerRow["result"];
    const status: LedgerRow["status"] = result ? "settled" : o ? "closed" : "pending";
    const view: EventView = {
      id: e.id,
      sportId: e.sportId as SportId,
      leagueId: e.leagueId,
      homeTeamId: e.homeTeamId,
      awayTeamId: e.awayTeamId,
      kickoff: e.kickoff.getTime(),
      status: e.status as EventStatus,
      score: e.homeScore !== null && e.awayScore !== null ? { home: e.homeScore, away: e.awayScore } : undefined,
      homeName: e.homeTeam.name,
      awayName: e.awayTeam.name,
      leagueName: e.league.name,
      sportName: SPORT_NAMES[e.sportId] ?? e.sportId,
    };
    return [
      {
        prediction: p,
        event: view,
        marketName: m.name,
        marketType: m.type as LedgerRow["marketType"],
        side: side(s.id),
        selectionName: s.name,
        bookmakerName: books.get(p.bookmakerId) ?? p.bookmakerId,
        status,
        closingOdds: o ? Number(o.closingOdds) : undefined,
        closingFairProbability: o?.closingFairProbability,
        marketProbabilityAtPrediction: at?.selections.find((x) => x.selectionId === p.selectionId)?.fairProbability ?? p.probability,
        result,
        clv: o ? clv(p.odds, o.closingFairProbability) : undefined,
      },
    ];
  });
}

/** Market detail for one selection, in the demo detail shape. */
export function realMarketDetail(snap: RealSnapshot, selectionId: string): (MarketDetail & { unavailableReason: string | null; teamNews: TeamNews | null }) | undefined {
  const now = snap.now;
  for (const e of snap.events) {
    const m = e.markets.find((x) => x.selections.some((s) => s.id === selectionId));
    if (!m) continue;
    const i = m.selections.findIndex((s) => s.id === selectionId);
    const prediction = snap.predictionsBySelection.get(selectionId);
    const row = snap.rows.find((r) => r.selectionId === selectionId) ?? buildRow(e, m, i, now, snap.books, prediction);
    if (!row) return undefined;
    const ref = Math.min(now, e.view.kickoff);
    const runs = m.runs.filter((r) => r <= ref);
    const chart = runs.flatMap((r) => {
      const line = consensusAt(m, r);
      const quotes = [...(latestByBook(m.points, r).get(selectionId)?.values() ?? [])];
      return line ? [{ at: r, consensus: line.selections[i].medianOdds, best: Math.max(...quotes) }] : [];
    });
    const nowQ = latestByBook(m.points, runs.at(-1) ?? ref).get(selectionId) ?? new Map<string, number>();
    const openQ = latestByBook(m.points, runs[0] ?? ref, Infinity).get(selectionId) ?? new Map<string, number>();
    const prevRun = runs.at(-2);
    const prevQ = prevRun !== undefined ? (latestByBook(m.points, prevRun).get(selectionId) ?? new Map<string, number>()) : nowQ;
    const books = [...nowQ].map(([id, odds]) => ({ id, name: snap.books.get(id) ?? id, odds, open: openQ.get(id) ?? NaN, oneHourAgo: prevQ.get(id) ?? NaN, lagMin: 0 }));

    const fc = e.forecast && "f" in e.forecast ? e.forecast : null;
    const sf = fc?.f.selections.find((s) => s.market === m.type && s.selection === m.selections[i].side);
    const line = consensusAt(m, runs.at(-1) ?? ref);
    const estimate = (id: string, p: number, lo: number, hi: number) => ({ selectionId: selectionId, modelVersionId: id, probability: p, ciLow: lo, ciHigh: hi, computedAt: now });
    const components = sf
      ? [
          estimate(REAL_MODEL.poisson.id, sf.components.poisson, sf.components.poisson, sf.components.poisson),
          ...(sf.components.elo !== null ? [estimate(REAL_MODEL.elo.id, sf.components.elo, sf.components.elo, sf.components.elo)] : []),
        ]
      : [];
    const ensemble = prediction ? estimate(prediction.modelVersionId, prediction.probability, prediction.ciLow, prediction.ciHigh) : sf ? estimate(REAL_MODEL.ensemble.id, sf.probability, sf.ciLow, sf.ciHigh) : estimate(REAL_MODEL.ensemble.id, NaN, NaN, NaN);
    const factors = fc && e.model && sf ? explainSelection(e.model, fc.home, fc.away, fc.f, m.type, m.selections[i].side) : [];
    return {
      row,
      event: e.view,
      analysis: { selectionId, ensemble, components, factors, confidence: prediction?.confidence ?? sf?.confidence ?? 0 },
      prediction,
      news: [],
      chart,
      books,
      siblings: m.selections.map((s, k) => {
        const p = snap.predictionsBySelection.get(s.id)?.probability ?? fc?.f.selections.find((x) => x.market === m.type && x.selection === s.side)?.probability ?? null;
        return { selectionId: s.id, name: s.name, marketProbability: line?.selections[k].fairProbability ?? NaN, modelProbability: p };
      }),
      teamNews: e.news,
      unavailableReason: e.forecast && "reason" in e.forecast ? e.forecast.reason : !e.model ? "The real model does not cover this competition yet." : null,
    };
  }
  return undefined;
}

/** One match in the Matches list: main market from opening to the latest pre-kickoff run. */
export function realMatchView(snap: RealSnapshot, eventId: string): MatchView | undefined {
  const e = snap.events.find((x) => x.view.id === eventId);
  const m = e?.markets.find((x) => x.type === "1X2" || x.type === "ML") ?? e?.markets[0];
  if (!e || !m) return undefined;
  const runs = m.runs.filter((r) => r <= Math.min(snap.now, e.view.kickoff));
  const open = runs.length ? consensusAt(m, runs[0]) : null;
  const close = runs.length ? consensusAt(m, runs.at(-1)!) : null;
  if (!open || !close) return undefined;
  const preds = m.selections.map((s) => snap.predictionsBySelection.get(s.id));
  return {
    event: e.view,
    showcase: false,
    marketName: m.name,
    selections: m.selections.map((s) => ({ id: s.id, name: s.name })),
    minutes: [],
    timeline: [],
    news: [],
    openingOdds: open.selections.map((x) => x.medianOdds),
    closingOdds: close.selections.map((x) => x.medianOdds),
    preMatchMarket: close.selections.map((x) => x.fairProbability),
    preMatchModel: preds.map((p) => p?.probability ?? null),
    modelVersion: preds.find((p) => p)?.modelVersionId ?? null,
    lineupConfirmedAt: e.view.lineupConfirmedAt,
    xg: e.news?.xg ?? null,
    results: m.selections.map((s) => (s.result === "won" || s.result === "lost" || s.result === "void" ? s.result : undefined)),
  };
}

/** Finished feed matches, newest first. */
export function realFinishedEvents(snap: RealSnapshot): EventView[] {
  return snap.events.filter((e) => e.view.status === "finished").map((e) => e.view).sort((a, b) => b.kickoff - a.kickoff);
}
