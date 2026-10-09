// Read model over the DEMO_MODE universe. Everything here is a function of
// `now`: what is visible, live, settled or pending follows real time.

import type { EventStatus, Prediction, PredictionOutcome, SportEvent, SportId } from "@/lib/domain/types";
import { appendPrediction, verifyChain, type ChainVerification } from "@/lib/ledger/hash";
import { clv } from "@/lib/metrics/clv";
import { modelConsensus } from "@/lib/metrics/consensus";
import { dataQuality, type DataQualityResult } from "@/lib/metrics/quality";
import { expectedValue } from "@/lib/metrics/value";
import { BOOKMAKERS, leagueById, SPORTS, teamById } from "./catalog";
import {
  bestPrice,
  bookPrice,
  consensusPrice,
  DAY,
  DEMO_GENESIS,
  eventsForDay,
  fairProbabilities,
  HOUR,
  MIN,
  showcaseLiveEvents,
  type EventSim,
  type MarketSim,
  type MinuteState,
  type SelectionModel,
} from "./universe";

const FEED_INTERVAL_MS = 30_000;
const LOOKAHEAD_DAYS = 8;

interface Universe {
  throughDay: number;
  events: EventSim[];
  byId: Map<string, EventSim>;
  /** Every prediction in creation order, hashed. Any prefix is a valid chain. */
  ledger: Prediction[];
  predictionBySelection: Map<string, Prediction>;
}

let universe: Universe | null = null;

function getUniverse(now: number): Universe {
  const throughDay = Math.floor(now / DAY) * DAY + LOOKAHEAD_DAYS * DAY;
  if (universe && universe.throughDay === throughDay) return universe;
  const events: EventSim[] = [];
  for (let day = DEMO_GENESIS; day <= throughDay; day += DAY) events.push(...eventsForDay(day));
  const drafts = events
    .flatMap((e) => e.predictions)
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
  const ledger: Prediction[] = [];
  for (const d of drafts) ledger.push(appendPrediction(ledger, d));
  universe = {
    throughDay,
    events,
    byId: new Map(events.map((e) => [e.event.id, e])),
    ledger,
    predictionBySelection: new Map(ledger.map((p) => [p.selectionId, p])),
  };
  return universe;
}

/** Every scheduled event in the universe (not the in-play showcase), for the demo picks. */
export function universeEvents(now: number): EventSim[] {
  return getUniverse(now).events;
}

export function feedTime(now: number): number {
  return Math.floor(now / FEED_INTERVAL_MS) * FEED_INTERVAL_MS;
}

export function statusAt(ev: EventSim, now: number): EventStatus {
  if (now < ev.event.kickoff) return "scheduled";
  if (now < ev.event.kickoff + ev.durationMin * MIN) return "live";
  return "finished";
}

/** Match minute and in-play state for a live football event. */
export function liveState(ev: EventSim, now: number): MinuteState | undefined {
  if (!ev.match) return undefined;
  const elapsed = Math.floor((now - ev.event.kickoff) / MIN);
  // 15-minute half-time break after minute 45.
  const minute = elapsed <= 45 ? elapsed : elapsed < 60 ? 45 : elapsed - 15;
  const idx = Math.min(Math.max(minute, 0), ev.match.minutes.length - 1);
  return ev.match.minutes[idx];
}

export function eventView(ev: EventSim, now: number): SportEvent & { homeName: string; awayName: string; leagueName: string; sportName: string } {
  const status = statusAt(ev, now);
  const live = status === "live" ? liveState(ev, now) : undefined;
  return {
    ...ev.event,
    status,
    score: status === "finished" ? ev.finalScore : live?.score,
    minute: live?.minute,
    homeName: teamById.get(ev.event.homeTeamId)!.name,
    awayName: teamById.get(ev.event.awayTeamId)!.name,
    leagueName: leagueById.get(ev.event.leagueId)!.name,
    sportName: SPORTS.find((s) => s.id === ev.event.sportId)!.name,
  };
}

// ---------------------------------------------------------------------------
// Ledger

export function visibleLedger(now: number): Prediction[] {
  const { ledger } = getUniverse(now);
  let lo = 0;
  let hi = ledger.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ledger[mid].createdAt <= now) lo = mid + 1;
    else hi = mid;
  }
  return ledger.slice(0, lo);
}

export function outcomeFor(p: Prediction, now: number): Partial<PredictionOutcome> & { status: "pending" | "closed" | "settled" } {
  const ev = getUniverse(now).byId.get(p.eventId)!;
  const status = statusAt(ev, now);
  if (status === "scheduled") return { predictionId: p.id, status: "pending" };
  const m = ev.markets.find((x) => x.market.id === p.marketId)!;
  const i = m.selections.findIndex((s) => s.selection.id === p.selectionId);
  const closingOdds = consensusPrice(ev, m, i, ev.event.kickoff);
  const closingFairProbability = fairProbabilities(ev, m, ev.event.kickoff)[i];
  if (status === "live") return { predictionId: p.id, status: "closed", closingOdds, closingFairProbability };
  return {
    predictionId: p.id,
    status: "settled",
    closingOdds,
    closingFairProbability,
    result: m.selections[i].selection.result,
    settledAt: ev.event.kickoff + ev.durationMin * MIN,
  };
}

export interface LedgerRow {
  prediction: Prediction;
  event: ReturnType<typeof eventView>;
  marketName: string;
  marketType: MarketSim["market"]["type"];
  /** Selection key within its market: home, draw, away, over, under, yes, no. */
  side: string;
  selectionName: string;
  bookmakerName: string;
  status: "pending" | "closed" | "settled";
  closingOdds?: number;
  closingFairProbability?: number;
  /** Margin-free consensus probability when the prediction was recorded. */
  marketProbabilityAtPrediction: number;
  result?: "won" | "lost" | "void";
  clv?: number;
}

let rowsCache: { at: number; rows: LedgerRow[] } | null = null;

/** Ledger rows with outcomes, snapped to the feed tick so heavy pages share one computation. */
export function ledgerRows(now: number): LedgerRow[] {
  const at = feedTime(now);
  if (rowsCache?.at === at) return rowsCache.rows;
  const rows = buildLedgerRows(at);
  rowsCache = { at, rows };
  return rows;
}

function buildLedgerRows(now: number): LedgerRow[] {
  const u = getUniverse(now);
  return visibleLedger(now).map((p) => {
    const ev = u.byId.get(p.eventId)!;
    const m = ev.markets.find((x) => x.market.id === p.marketId)!;
    const s = m.selections.find((x) => x.selection.id === p.selectionId)!;
    const o = outcomeFor(p, now);
    return {
      prediction: p,
      event: eventView(ev, now),
      marketName: m.market.name,
      marketType: m.market.type,
      side: s.selection.id.slice(m.market.id.length + 1),
      selectionName: s.selection.name,
      bookmakerName: BOOKMAKERS.find((b) => b.id === p.bookmakerId)?.name ?? p.bookmakerId,
      status: o.status,
      closingOdds: o.closingOdds,
      closingFairProbability: o.closingFairProbability,
      marketProbabilityAtPrediction: fairProbabilities(ev, m, p.createdAt)[m.selections.indexOf(s)],
      result: o.result,
      clv: o.closingFairProbability !== undefined ? clv(p.odds, o.closingFairProbability) : undefined,
    };
  });
}

export interface LedgerAudit {
  verification: ChainVerification;
  count: number;
  headHash: string | null;
  firstAt: number | null;
  lastAt: number | null;
  missing: { eventId: string; marketId: string; reason: string; kickoff: number }[];
  changed: number;
  deleted: number;
  versionChanges: { versionId: string; firstSeenAt: number; count: number }[];
}

export function ledgerAudit(now: number): LedgerAudit {
  const u = getUniverse(now);
  const visible = visibleLedger(now);
  const versions = new Map<string, { firstSeenAt: number; count: number }>();
  for (const p of visible) {
    const v = versions.get(p.modelVersionId);
    if (v) v.count++;
    else versions.set(p.modelVersionId, { firstSeenAt: p.createdAt, count: 1 });
  }
  const verification = verifyChain(visible);
  return {
    verification,
    count: visible.length,
    headHash: visible.at(-1)?.hash ?? null,
    firstAt: visible[0]?.createdAt ?? null,
    lastAt: visible.at(-1)?.createdAt ?? null,
    missing: u.events
      .filter((e) => e.predictionAt <= now)
      .flatMap((e) => e.missing.map((m) => ({ eventId: e.event.id, marketId: m.marketId, reason: m.reason, kickoff: e.event.kickoff }))),
    // The demo store is append-only by construction; the database enforces the same with a trigger.
    changed: verification.ok ? 0 : 1,
    deleted: 0,
    versionChanges: [...versions.entries()].map(([versionId, v]) => ({ versionId, ...v })).sort((a, b) => a.firstSeenAt - b.firstSeenAt),
  };
}

// ---------------------------------------------------------------------------
// Market rows

export interface MarketRow {
  selectionId: string;
  eventId: string;
  marketId: string;
  sportId: SportId;
  leagueId: string;
  marketType: MarketSim["market"]["type"];
  /** Selection key within its market: home, draw, away, over, under, yes, no. */
  side: string;
  sport: string;
  league: string;
  match: string;
  kickoff: number;
  status: EventStatus;
  minute?: number;
  score?: { home: number; away: number };
  market: string;
  selection: string;
  bestOdds: number;
  bestBook: string;
  bestBookId: string | null;
  /** Each bookmaker's latest price for this selection, highest first. */
  quotes?: {
    book: string;
    /** Bookmaker id as stored; live ids carry the feed's prefix ("apf-bet365", "toa-pinnacle"). */
    bookId: string;
    odds: number;
    /** When this price was observed. */
    at: number;
  }[];
  openingOdds: number;
  currentOdds: number;
  marketProbability: number;
  modelProbability: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  modelVersion: string | null;
  ev: number | null;
  movement: number;
  confidence: number | null;
  /** Standard deviation of the component models' probabilities, pp. */
  modelStdevPp: number | null;
  dataQuality: DataQualityResult;
  booksQuoting: number;
  lastUpdate: number;
}

function booksMoving(ev: EventSim, m: MarketSim, i: number, from: number, to: number, direction: number) {
  let moving = 0;
  let quoting = 0;
  BOOKMAKERS.forEach((_, b) => {
    const a = bookPrice(ev, m, i, b, from);
    const z = bookPrice(ev, m, i, b, to);
    if (Number.isNaN(a) || Number.isNaN(z)) return;
    quoting++;
    const chg = z / a - 1;
    if (Math.abs(chg) > 0.01 && Math.sign(chg) === direction) moving++;
  });
  return { moving, quoting };
}

export function inPlayOdds(p: number, margin: number): number {
  return Math.max(1.01, Math.round((1 / (p * (1 + margin))) * 100) / 100);
}

function preMatchRow(ev: EventSim, m: MarketSim, i: number, t: number, prediction: Prediction | undefined, model: SelectionModel): MarketRow {
  const view = eventView(ev, t);
  const s = m.selections[i];
  const best = bestPrice(ev, m, i, t);
  const openingOdds = consensusPrice(ev, m, i, ev.openAt);
  const currentOdds = consensusPrice(ev, m, i, t);
  const marketProbability = fairProbabilities(ev, m, t)[i];
  const movement = currentOdds / openingOdds - 1;
  const since = Math.max(ev.openAt, t - 6 * HOUR);
  const breadth = booksMoving(ev, m, i, since, t, Math.sign(currentOdds - consensusPrice(ev, m, i, since)) || 1);
  const hoursToKickoff = (ev.event.kickoff - t) / HOUR;
  const latestNews = ev.news.filter((n) => n.at <= t && n.kind !== "lineup").at(-1);
  const dq = dataQuality({
    now: t,
    oddsUpdatedAt: t - (hashOffset(s.selection.id, t) % 20) * 1000,
    statsUpdatedAt: Math.floor(t / HOUR) * HOUR,
    injuriesUpdatedAt: latestNews?.at ?? Math.floor(t / (6 * HOUR)) * 6 * HOUR,
    lineupConfirmedAt: ev.event.lineupConfirmedAt !== undefined && ev.event.lineupConfirmedAt <= t ? ev.event.lineupConfirmedAt : undefined,
    hoursToKickoff,
    sourceReliability: 0.96,
    booksQuoting: breadth.quoting,
    booksTracked: BOOKMAKERS.length,
  });
  const cons = modelConsensus(model.components.map((c) => c.probability));
  const p = prediction?.probability ?? null;
  return {
    selectionId: s.selection.id,
    eventId: ev.event.id,
    marketId: m.market.id,
    sportId: ev.event.sportId,
    leagueId: ev.event.leagueId,
    marketType: m.market.type,
    side: s.selection.id.slice(m.market.id.length + 1),
    sport: view.sportName,
    league: view.leagueName,
    match: `${view.homeName} vs ${view.awayName}`,
    kickoff: ev.event.kickoff,
    status: view.status,
    market: m.market.name,
    selection: s.selection.name,
    bestOdds: best.odds,
    bestBook: BOOKMAKERS.find((b) => b.id === best.bookmakerId)?.name ?? "",
    bestBookId: best.bookmakerId || null,
    quotes: BOOKMAKERS.map((b, j) => ({ book: b.name, bookId: b.id, odds: bookPrice(ev, m, i, j, t), at: t }))
      .filter((q) => !Number.isNaN(q.odds))
      .sort((a, b) => b.odds - a.odds),
    openingOdds,
    currentOdds,
    marketProbability,
    modelProbability: p,
    ciLow: prediction?.ciLow ?? null,
    ciHigh: prediction?.ciHigh ?? null,
    modelVersion: prediction?.modelVersionId ?? null,
    ev: p === null ? null : expectedValue(p, best.odds),
    movement,
    confidence: prediction?.confidence ?? null,
    modelStdevPp: prediction ? cons.stdevPp : null,
    dataQuality: dq,
    booksQuoting: breadth.quoting,
    lastUpdate: t - (hashOffset(s.selection.id, t) % 20) * 1000,
  };
}

function hashOffset(id: string, t: number): number {
  let h = 7;
  const s = `${id}:${Math.floor(t / 30_000)}`;
  for (let k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) >>> 0;
  return h;
}

function inPlayRows(ev: EventSim, t: number): MarketRow[] {
  const state = liveState(ev, t);
  if (!state) return [];
  const view = eventView(ev, t);
  const m = ev.markets[0];
  return m.selections.map((s, i) => {
    const marketProbability = state.market[i];
    const model = state.model[i];
    const currentOdds = inPlayOdds(marketProbability, 0.05);
    const best = inPlayOdds(marketProbability, 0.035);
    const openingOdds = consensusPrice(ev, m, i, ev.event.kickoff);
    return {
      selectionId: s.selection.id,
      eventId: ev.event.id,
      marketId: m.market.id,
      sportId: ev.event.sportId,
      leagueId: ev.event.leagueId,
      marketType: m.market.type,
      side: s.selection.id.slice(m.market.id.length + 1),
      sport: view.sportName,
      league: view.leagueName,
      match: `${view.homeName} vs ${view.awayName}`,
      kickoff: ev.event.kickoff,
      status: "live" as const,
      minute: state.minute,
      score: state.score,
      market: m.market.name,
      selection: s.selection.name,
      bestOdds: best,
      bestBook: "In-play consensus",
      bestBookId: null,
      openingOdds,
      currentOdds,
      marketProbability,
      modelProbability: model,
      ciLow: Math.max(0.005, model - 0.04),
      ciHigh: Math.min(0.995, model + 0.04),
      modelVersion: "football-inplay-v0.6",
      ev: expectedValue(model, best),
      movement: currentOdds / openingOdds - 1,
      confidence: 55,
      modelStdevPp: null,
      dataQuality: dataQuality({
        now: t,
        oddsUpdatedAt: t - 3000,
        statsUpdatedAt: t - 20_000,
        injuriesUpdatedAt: t - HOUR,
        lineupConfirmedAt: ev.event.lineupConfirmedAt,
        hoursToKickoff: 0,
        sourceReliability: 0.94,
        booksQuoting: 8,
        booksTracked: BOOKMAKERS.length,
      }),
      booksQuoting: 8,
      lastUpdate: t - 3000,
    };
  });
}

/** The last few feed times' rows: the live scores read the rows of three hours ago next to the current ones. */
const rowCache = new Map<number, MarketRow[]>();
const ROW_CACHE_SIZE = 3;

/** Every open market: pre-match markets within a week of kickoff plus in-play match-winner markets. */
export function marketRows(now: number): MarketRow[] {
  const t = feedTime(now);
  const cached = rowCache.get(t);
  if (cached) return cached;
  const u = getUniverse(now);
  const rows: MarketRow[] = [];
  for (const ev of u.events) {
    const status = statusAt(ev, t);
    if (status === "finished" || ev.openAt > t) continue;
    if (status === "live") {
      rows.push(...inPlayRows(ev, t));
      continue;
    }
    for (const m of ev.markets) {
      m.selections.forEach((s, i) => {
        const pred = u.predictionBySelection.get(s.selection.id);
        rows.push(preMatchRow(ev, m, i, t, pred && pred.createdAt <= t ? pred : undefined, ev.models.get(s.selection.id)!));
      });
    }
  }
  for (const ev of showcaseLiveEvents(t)) if (statusAt(ev, t) === "live") rows.push(...inPlayRows(ev, t));
  if (rowCache.size >= ROW_CACHE_SIZE) rowCache.delete(rowCache.keys().next().value!);
  rowCache.set(t, rows);
  return rows;
}

// ---------------------------------------------------------------------------
// Event lookup

export function findEvent(eventId: string, now: number): EventSim | undefined {
  return getUniverse(now).byId.get(eventId) ?? showcaseLiveEvents(feedTime(now)).find((e) => e.event.id === eventId);
}

// ---------------------------------------------------------------------------
// Data sources

export function dataSources(now: number) {
  const t = feedTime(now);
  return [
    { id: "demo-odds", name: "Demo odds feed", kind: "odds" as const, status: "ok" as const, lastSyncAt: t, provider: "ODDSIQ demo generator" },
    { id: "demo-stats", name: "Demo statistics feed", kind: "stats" as const, status: "ok" as const, lastSyncAt: Math.floor(now / HOUR) * HOUR, provider: "ODDSIQ demo generator" },
    { id: "demo-lineups", name: "Demo lineups feed", kind: "lineups" as const, status: "ok" as const, lastSyncAt: Math.floor(now / (5 * MIN)) * 5 * MIN, provider: "ODDSIQ demo generator" },
    { id: "demo-injuries", name: "Demo injury news", kind: "injuries" as const, status: "ok" as const, lastSyncAt: Math.floor(now / (10 * MIN)) * 10 * MIN, provider: "ODDSIQ demo generator" },
  ];
}

export function universeStats(now: number) {
  const u = getUniverse(now);
  const visible = u.events.filter((e) => e.openAt <= now);
  return {
    events: visible.length,
    finished: visible.filter((e) => statusAt(e, now) === "finished").length,
    leagues: new Set(visible.map((e) => e.event.leagueId)).size,
    bookmakers: BOOKMAKERS.length,
  };
}
