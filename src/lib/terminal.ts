// One entry point for the terminal pages' data. DEMO_MODE (default) serves the
// deterministic demo universe; with DEMO_MODE=false the same shapes come from
// the live odds feed and the real model in Postgres.

import { after, connection } from "next/server";
import { DataSourceNotConfiguredError, DEMO_MODE } from "@/lib/data";
import { db, DATABASE_CONFIGURED } from "@/lib/db";
import { configuredStatsFeed } from "@/lib/stats/config";
import { refreshLineupsOnVisit } from "@/lib/stats/lineups";
import { loadScoring, refreshScorerFormOnVisit, type TeamScoring } from "@/lib/real/scorers";
import { topScorer, type TopScorer } from "@/lib/top-scorer";
import { loadPredictions, refreshPredictionsOnVisit, type AfPrediction } from "@/lib/stats/af-predictions";
import { statsConfig } from "@/lib/stats/config";
import { clubEloCovers, clubEloRatings, clubPair, type ClubEloPair } from "@/lib/stats/clubelo";
import { settleOnVisit } from "@/lib/providers/settle-on-visit";
import { ALERT_TYPES, marketAlerts, type MarketAlert } from "@/lib/demo/alerts";
import { BOOKMAKERS } from "@/lib/demo/catalog";
import { demoPersonal, type PersonalCtx } from "@/lib/demo/personal";
import * as demo from "@/lib/demo/store";
import { realPersonal } from "@/lib/real/personal";
import type { LedgerAudit, LedgerRow, MarketDetail, MarketRow, MatchView, ReplayData, SettledSelection } from "@/lib/demo/store";
import { realLiveBoard, realLiveView, realReplayData, realReplayEvents, type LiveBoardRow } from "@/lib/real/live";
import { LIVE_ALERT_TYPES, realAlerts } from "@/lib/real/alerts";
import { realSettledSelections } from "@/lib/real/settled";
import type { TeamNews } from "@/lib/stats/news";
import type { PickContext } from "@/lib/picks";
import { rating } from "@/lib/model/elo";
import { DEMO_SHARP_BOOKS, demoPickContext, demoRecordedPicks } from "@/lib/demo/picks";
import { LIVE_SHARP_BOOKS, type SharpBooks } from "@/lib/sharp";
import type { RecordedPick } from "@/lib/picks-extra";
import { readRecordedPicks } from "@/lib/real/pick-records";
import { realFinishedEvents, realMarketDetail, realMatchView, realSnapshot, type EventView, type RealSnapshot, type SourceView } from "@/lib/real/store";

export interface Terminal {
  live: boolean;
  now: number;
  /** When the displayed prices were last refreshed. */
  feedTime: number;
  /** Source label for metric context lines. */
  ledgerSource: string;
  /** Footnote label: "DEMO DATA" or the live source. */
  dataLabel: string;
  marketRows(): MarketRow[];
  /** The full prediction ledger; on live data this loads the whole ledger, so only the CSV export asks for it. */
  ledgerRows(): Promise<LedgerRow[]>;
  ledgerAudit(): Promise<LedgerAudit>;
  dataSources(): SourceView[];
  marketDetail(selectionId: string): (MarketDetail & { unavailableReason?: string | null; teamNews?: TeamNews | null }) | undefined;
  matchView(eventId: string): MatchView | undefined;
  /** Finished matches, newest first. */
  finishedEvents(): EventView[];
  /** Alerts fired in the last 24 hours, newest first, and the rules that apply to this data. */
  alerts(): Promise<MarketAlert[]>;
  alertTypes: typeof ALERT_TYPES;
  /** Settled markets with their price history, and the bookmakers quoting them. */
  settled(): Promise<{ rows: SettledSelection[]; books: { id: string; name: string }[] }>;
  /** Data for the watchlist, My Bets and the AI Analyst. */
  personal(): Promise<PersonalCtx>;
  /** Matches in play now. */
  liveBoard(): LiveBoardRow[];
  /** A match with its in-play minutes (demo) or feed runs (live). */
  liveView(eventId: string): MatchView | undefined;
  /** Finished matches that Market Replay can show, newest first. */
  replayEvents(): EventView[];
  replay(eventId: string): Promise<ReplayData | undefined>;
  /** Expected goals and team news behind a match's forecast, for the daily picks. */
  pickContext(eventId: string): PickContext | null;
  /** The fair-price and bet bookmakers for Dagens bedste bets (sharp.ts). */
  sharpBooks: SharpBooks;
  /** Picks shown on recent days, settled where the result is known. */
  /** Recorded picks with kickoff in the last `days` days (default 7). Demo mode always replays 7 days, to keep the page fast. */
  recordedPicks(days?: number): Promise<RecordedPick[]>;
}

const FRESH_MS = 5 * 60_000;
const STALE_MS = 60 * 60_000;
let latest: { at: number; snap: RealSnapshot } | null = null;
let rebuilding: Promise<RealSnapshot> | null = null;

/**
 * The live snapshot, stale-while-revalidate: up to five minutes old it is
 * served as is; up to an hour old it is still served at once while a fresh one
 * is built after the response, so a visitor only waits on a cold server.
 */
async function liveSnapshot(now: number, fresh: boolean): Promise<RealSnapshot> {
  if (fresh) {
    const snap = await realSnapshot(db(), now, { ledger: false, fresh: true });
    latest = { at: now, snap };
    return snap;
  }
  const rebuild = () =>
    (rebuilding ??= realSnapshot(db(), now, { ledger: false })
      .then((snap) => {
        latest = { at: now, snap };
        return snap;
      })
      .finally(() => {
        rebuilding = null;
      }));
  if (latest && now - latest.at < FRESH_MS) return latest.snap;
  // Lineups near kickoff and results of finished matches, after the response; the next snapshot shows them.
  after(() => lineupsOnVisit(now));
  after(() => resultsOnVisit(now));
  after(() => predictionsOnVisit(now));
  after(() => scorersOnVisit(now));
  if (latest && now - latest.at < STALE_MS) {
    const stale = latest.snap;
    after(() => rebuild().catch(() => undefined));
    return stale;
  }
  return rebuild();
}

async function lineupsOnVisit(now: number): Promise<void> {
  const feed = configuredStatsFeed();
  if (!feed) return;
  const s = await refreshLineupsOnVisit(db(), feed, now).catch(() => null);
  // New lineups change the picks, so the next visit gets a fresh snapshot.
  if (s?.fetched) latest = null;
}

async function predictionsOnVisit(now: number): Promise<void> {
  const s = await refreshPredictionsOnVisit(db(), statsConfig().apiKey, now).catch(() => null);
  if (s?.fetched) predictionMemo = null;
}

async function scorersOnVisit(now: number): Promise<void> {
  const feed = configuredStatsFeed();
  if (!feed) return;
  const s = await refreshScorerFormOnVisit(db(), feed, now).catch(() => null);
  if (s?.teams) scoringMemo = null;
}

let scoringMemo: { snap: RealSnapshot; at: number; map: Map<string, { home: TeamScoring; away: TeamScoring }> } | null = null;

/** Season totals and last matches for the snapshot's upcoming football matches; reused for a few minutes. */
async function scoringFor(snap: RealSnapshot, now: number) {
  if (scoringMemo?.snap === snap && now - scoringMemo.at < PREDICTIONS_FRESH_MS) return scoringMemo.map;
  const ids = snap.events.filter((e) => e.view.status === "scheduled" && e.view.sportId === "football").map((e) => e.view.id);
  const map = await loadScoring(db(), ids, now).catch(() => new Map<string, { home: TeamScoring; away: TeamScoring }>());
  scoringMemo = { snap, at: now, map };
  return map;
}

/** Both teams' top scorers, with injuries and lineups from the match's team news. */
function scorersOf(s: { home: TeamScoring; away: TeamScoring } | undefined, news: TeamNews | null): { home: TopScorer | null; away: TopScorer | null } | undefined {
  if (!s) return undefined;
  const side = (k: "home" | "away") => ({ injuries: news?.injuries.filter((i) => i.side === k) ?? [], lineup: news?.lineups.find((l) => l.side === k) ?? null });
  const out = { home: topScorer(s.home.players, s.home.recent, side("home")), away: topScorer(s.away.players, s.away.recent, side("away")) };
  return out.home || out.away ? out : undefined;
}

const PREDICTIONS_FRESH_MS = 5 * 60_000;
let predictionMemo: { snap: RealSnapshot; at: number; map: Map<number, AfPrediction> } | null = null;

/** API-Football's stored predictions for the snapshot's matches; one small query, reused for a few minutes. */
async function predictionsFor(snap: RealSnapshot, now: number): Promise<Map<number, AfPrediction>> {
  if (predictionMemo?.snap === snap && now - predictionMemo.at < PREDICTIONS_FRESH_MS) return predictionMemo.map;
  const ids = snap.events.filter((e) => e.view.status === "scheduled" && e.fixtureId !== null).map((e) => e.fixtureId!);
  const map = await loadPredictions(db(), ids).catch(() => new Map<number, AfPrediction>());
  predictionMemo = { snap, at: now, map };
  return map;
}

async function resultsOnVisit(now: number): Promise<void> {
  const s = await settleOnVisit(db(), now).catch(() => null);
  if (s?.some((x) => x.results > 0)) latest = null;
}

/** `fresh` skips every cache, for the data runs that have just written new odds and results. */
export async function terminal(opts: { fresh?: boolean } = {}): Promise<Terminal> {
  await connection();
  const now = Date.now();
  if (DEMO_MODE) {
    return {
      live: false,
      now,
      feedTime: demo.feedTime(now),
      ledgerSource: "Oddsanalyse prediction ledger (DEMO DATA)",
      dataLabel: "DEMO DATA",
      marketRows: () => demo.marketRows(now),
      ledgerRows: async () => demo.ledgerRows(now),
      ledgerAudit: async () => demo.ledgerAudit(now),
      dataSources: () => demo.dataSources(now),
      marketDetail: (id) => demo.marketDetail(id, now),
      matchView: (id) => demo.matchView(id, now),
      finishedEvents: () => demo.replayableEvents(now),
      alerts: async () => marketAlerts(now),
      alertTypes: ALERT_TYPES,
      settled: async () => ({ rows: demo.settledSelections(now), books: BOOKMAKERS }),
      personal: async () => demoPersonal(now),
      liveBoard: () =>
        [...new Map(demo.marketRows(now).filter((r) => r.status === "live").map((r) => [r.eventId, r])).values()].map((r) => ({
          eventId: r.eventId,
          selectionId: r.selectionId,
          sport: r.sport,
          league: r.league,
          match: r.match,
          kickoff: r.kickoff,
          minute: r.minute ?? 0,
          score: r.score ?? null,
          scoreAt: null,
        })),
      liveView: (id) => demo.matchView(id, now),
      replayEvents: () => demo.replayableEvents(now),
      replay: async (id) => demo.replayData(id, now),
      pickContext: (id) => demoPickContext(id, now),
      sharpBooks: DEMO_SHARP_BOOKS,
      recordedPicks: async () => demoRecordedPicks(now),
    };
  }
  if (!DATABASE_CONFIGURED) throw new DataSourceNotConfiguredError();
  const snap = await liveSnapshot(now, Boolean(opts.fresh));
  // The ledger views need the full snapshot; built only when one of them is asked for.
  let fullSnap: Promise<RealSnapshot> | null = null;
  const full = () => (fullSnap ??= realSnapshot(db(), now));
  const [clubs, predictions, scoring] = await Promise.all([clubEloRatings(now), predictionsFor(snap, now), scoringFor(snap, now)]);
  const clubMemo = new Map<string, ClubEloPair | null>();
  const clubEloOf = (e: RealSnapshot["events"][number]) => {
    if (!clubs || !clubEloCovers(e.view.leagueId)) return null;
    if (!clubMemo.has(e.view.id)) clubMemo.set(e.view.id, clubPair(e.view.homeName, e.view.awayName, e.view.leagueId, clubs.ratings, clubs.date));
    return clubMemo.get(e.view.id)!;
  };
  return {
    live: true,
    now,
    feedTime: Math.max(0, ...snap.rows.map((r) => r.lastUpdate)) || now,
    ledgerSource: "Oddsanalyse prediction ledger (live)",
    dataLabel: "Live odds og Oddsanalyse-modellen",
    marketRows: () => snap.rows,
    ledgerRows: async () => (await full()).ledger,
    ledgerAudit: async () => (await full()).audit,
    dataSources: () => snap.sources,
    marketDetail: (id) => realMarketDetail(snap, id),
    matchView: (id) => realMatchView(snap, id),
    finishedEvents: () => realFinishedEvents(snap),
    alerts: async () => realAlerts(await full()),
    alertTypes: LIVE_ALERT_TYPES,
    settled: () => realSettledSelections(db(), now),
    personal: async () => realPersonal(db(), await full()),
    liveBoard: () => realLiveBoard(snap),
    liveView: (id) => realLiveView(snap, id),
    replayEvents: () => realReplayEvents(snap),
    replay: async (id) => realReplayData(db(), await full(), id),
    recordedPicks: (days) => readRecordedPicks(db(), now, days),
    sharpBooks: LIVE_SHARP_BOOKS,
    pickContext: (id) => {
      const e = snap.events.find((x) => x.view.id === id);
      if (!e) return null;
      const clubElo = clubEloOf(e);
      const afPrediction = (e.fixtureId !== null && predictions.get(e.fixtureId)) || null;
      // A league without results history: only the cross-league strength and the team news.
      const scorers = scorersOf(scoring.get(e.view.id), e.news);
      if (!e.forecast || !("f" in e.forecast)) return clubElo || afPrediction || scorers || e.news ? { news: e.news ?? null, clubElo, afPrediction, scorers } : null;
      const { f, home, away } = e.forecast;
      const teams = e.model ? { home, away, homeElo: rating(e.model.elo, home), awayElo: rating(e.model.elo, away), history: e.model.history } : undefined;
      return { expectedGoals: f.expectedGoals, news: e.news, teams, counts: e.counts, htShare: e.htShare, clubElo, afPrediction, scorers };
    },
  };
}
