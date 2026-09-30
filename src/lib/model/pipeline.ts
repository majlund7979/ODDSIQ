// The real model's scheduled work, run after each odds ingestion:
//   1. refresh historical results from openfootball
//   2. record a prediction in the ledger for every feed market kicking off
//      within PREDICTION_LEAD_MS, once, using only data available now
//   3. after kickoff, attach the closing line; after the result, settle
//   4. once a day, re-run the walk-forward backtest per league

import type { PrismaClient } from "@/generated/prisma/client";
import { appendPredictions } from "@/lib/ledger/append";
import { closingLine } from "@/lib/providers/closing";
import { backtest } from "./backtest";
import { fitOrderedLogit, newElo, updateElo, eloDiff } from "./elo";
import { forecastMatch, REAL_MODEL } from "./ensemble";
import { fetchSeason, leagueForOddsKey, OPENFOOTBALL_SOURCE, recentSeasons, seasonOf, type HistMatch } from "./openfootball";
import { fitPoisson } from "./poisson";
import { matchTeam } from "./teams";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const PREDICTION_LEAD_MS = 24 * HOUR;
/** A price older than this is not used as the recorded price. */
export const PRICE_MAX_AGE_MS = 6 * HOUR;
const SEASONS_KEPT = 4;
const MODEL_RELEASED = Date.parse("2026-09-30T00:00:00Z");

export interface ModelRunSummary {
  resultsAdded: number;
  predictions: number;
  missing: { event: string; reason: string }[];
  outcomes: number;
  settled: number;
  backtests: string[];
}

export async function refreshResults(prisma: PrismaClient, league: string, now: number, fetchImpl: typeof fetch = fetch): Promise<number> {
  let added = 0;
  const current = seasonOf(now);
  for (const season of recentSeasons(now, SEASONS_KEPT)) {
    if (season !== current && (await prisma.historicalMatch.count({ where: { league, season } })) > 0) continue;
    const rows = await fetchSeason(league, season, fetchImpl);
    if (rows?.length) added += await storeResults(prisma, rows, OPENFOOTBALL_SOURCE);
  }
  return added;
}

export async function storeResults(prisma: PrismaClient, rows: HistMatch[], source: string): Promise<number> {
  const r = await prisma.historicalMatch.createMany({
    data: rows.map((m) => ({ source, league: m.league, season: m.season, date: new Date(m.date), home: m.home, away: m.away, hg: m.hg, ag: m.ag })),
    skipDuplicates: true,
  });
  return r.count;
}

async function loadResults(prisma: PrismaClient, league: string, before: number): Promise<HistMatch[]> {
  const rows = await prisma.historicalMatch.findMany({ where: { league, date: { lt: new Date(before), gte: new Date(before - SEASONS_KEPT * 366 * DAY) } }, orderBy: { date: "asc" } });
  return rows.map((r) => ({ league: r.league, season: r.season, date: r.date.getTime(), home: r.home, away: r.away, hg: r.hg, ag: r.ag }));
}

async function ensureModelVersions(prisma: PrismaClient, now: number) {
  for (const v of [REAL_MODEL.ensemble, REAL_MODEL.poisson, REAL_MODEL.elo]) {
    await prisma.modelVersion.upsert({
      where: { id: v.id },
      create: { id: v.id, family: v.family, version: v.version, releasedAt: new Date(MODEL_RELEASED), trainingFrom: new Date(now - 3 * 365 * DAY), trainingTo: new Date(now), features: REAL_MODEL.features, notes: REAL_MODEL.notes },
      update: {},
    });
  }
}

/** The market's selection keys in ledger order, and how the model names them. */
const MARKET_KEYS: Record<string, string[]> = { "1X2": ["home", "draw", "away"], OU25: ["over", "under"] };

export async function predictUpcoming(prisma: PrismaClient, oddsKey: string, now: number): Promise<{ predictions: number; missing: { event: string; reason: string }[] }> {
  const league = leagueForOddsKey(oddsKey);
  const missing: { event: string; reason: string }[] = [];
  if (!league) return { predictions: 0, missing };
  const events = await prisma.event.findMany({
    where: { leagueId: { endsWith: `-${oddsKey}` }, externalId: { not: null }, status: "scheduled", kickoff: { gt: new Date(now), lte: new Date(now + PREDICTION_LEAD_MS) } },
    include: { homeTeam: true, awayTeam: true, markets: { include: { selections: true } } },
  });
  if (!events.length) return { predictions: 0, missing };

  const history = await loadResults(prisma, league.code, now);
  const fit = fitPoisson(history, now);
  const elo = newElo();
  const olRows: { diff: number; outcome: "home" | "draw" | "away" }[] = [];
  const warmUp = (history[0]?.date ?? now) + 180 * DAY;
  for (const m of history) {
    const diff = eloDiff(elo, m.home, m.away);
    if (m.date >= warmUp) olRows.push({ diff, outcome: m.hg > m.ag ? "home" : m.hg === m.ag ? "draw" : "away" });
    updateElo(elo, m);
  }
  const ol = fitOrderedLogit(olRows);
  const names = [...new Set(history.filter((m) => m.date >= now - 400 * DAY).flatMap((m) => [m.home, m.away]))];

  const entries = [];
  for (const e of events) {
    const label = `${e.homeTeam.name} v ${e.awayTeam.name}`;
    const note = async (reason: string) => {
      missing.push({ event: label, reason });
      for (const m of e.markets) await prisma.missingPrediction.upsert({ where: { marketId: m.id }, create: { marketId: m.id, eventId: e.id, reason, kickoff: e.kickoff }, update: { reason } });
    };
    if (!fit || olRows.length < 200) {
      await note(`Not enough ${league.name} results to fit the model`);
      continue;
    }
    const home = matchTeam(e.homeTeam.name, names);
    const away = matchTeam(e.awayTeam.name, names);
    if (!home || !away) {
      await note(`Team name not matched to results data: ${[!home && e.homeTeam.name, !away && e.awayTeam.name].filter(Boolean).join(", ")}`);
      continue;
    }
    const f = forecastMatch(fit, elo, ol, home, away);
    let recorded = 0;
    for (const m of e.markets) {
      const keys = MARKET_KEYS[m.type];
      if (!keys) continue;
      for (const key of keys) {
        const sel = m.selections.find((s) => s.id.endsWith(`-${key}`));
        const fc = f.selections.find((s) => s.market === m.type && s.selection === key);
        if (!sel || !fc) continue;
        if (await prisma.prediction.findFirst({ where: { selectionId: sel.id, modelVersionId: REAL_MODEL.ensemble.id }, select: { id: true } })) continue;
        const best = await prisma.oddsSnapshot.findFirst({ where: { selectionId: sel.id, observedAt: { gte: new Date(now - PRICE_MAX_AGE_MS), lte: new Date(now) } }, orderBy: [{ odds: "desc" }, { observedAt: "desc" }] });
        if (!best) continue;
        entries.push({
          id: `${REAL_MODEL.ensemble.id}:${sel.id}`,
          createdAt: now,
          eventId: e.id,
          marketId: m.id,
          selectionId: sel.id,
          modelVersionId: REAL_MODEL.ensemble.id,
          probability: fc.probability,
          ciLow: fc.ciLow,
          ciHigh: fc.ciHigh,
          confidence: fc.confidence,
          odds: Number(best.odds),
          bookmakerId: best.bookmakerId,
        });
        recorded++;
      }
    }
    if (recorded) await prisma.missingPrediction.deleteMany({ where: { eventId: e.id } });
    else if (!(await prisma.prediction.findFirst({ where: { eventId: e.id, modelVersionId: REAL_MODEL.ensemble.id } }))) await note("No current bookmaker price to record against");
  }
  return { predictions: await appendPredictions(prisma, entries), missing };
}

/** Attaches closing lines to kicked-off predictions and settles finished ones. */
export async function closeAndSettle(prisma: PrismaClient, now: number): Promise<{ outcomes: number; settled: number }> {
  let outcomes = 0;
  const open = await prisma.prediction.findMany({
    where: { modelVersionId: REAL_MODEL.ensemble.id, outcome: null },
    include: { selection: { include: { market: { include: { event: true, selections: true } } } } },
  });
  for (const p of open) {
    const ev = p.selection.market.event;
    if (ev.kickoff.getTime() > now) continue;
    const keys = MARKET_KEYS[p.selection.market.type] ?? [];
    const ids = keys.map((k) => p.selection.market.selections.find((s) => s.id.endsWith(`-${k}`))?.id).filter((x): x is string => Boolean(x));
    const snaps = await prisma.oddsSnapshot.findMany({ where: { selectionId: { in: ids }, observedAt: { lte: ev.kickoff } } });
    const line = closingLine(
      snaps.map((s) => ({ bookmakerId: s.bookmakerId, selectionId: s.selectionId, observedAt: s.observedAt.getTime(), odds: Number(s.odds) })),
      ids,
      ev.kickoff.getTime(),
    );
    const mine = line?.selections.find((s) => s.selectionId === p.selectionId);
    if (!mine) continue;
    await prisma.predictionOutcome.create({ data: { predictionId: p.id, closingOdds: mine.medianOdds, closingFairProbability: mine.fairProbability } });
    outcomes++;
  }
  const unsettled = await prisma.predictionOutcome.findMany({ where: { result: null, prediction: { modelVersionId: REAL_MODEL.ensemble.id } }, include: { prediction: { include: { selection: true } } } });
  let settled = 0;
  for (const o of unsettled) {
    const result = o.prediction.selection.result;
    if (!result) continue;
    await prisma.predictionOutcome.update({ where: { predictionId: o.predictionId }, data: { result, settledAt: new Date(now) } });
    settled++;
  }
  return { outcomes, settled };
}

export async function refreshBacktest(prisma: PrismaClient, league: string, now: number): Promise<boolean> {
  const latest = await prisma.modelBacktest.findFirst({ where: { league, modelVersionId: REAL_MODEL.ensemble.id }, orderBy: { createdAt: "desc" } });
  if (latest && now - latest.createdAt.getTime() < 20 * HOUR) return false;
  const history = await loadResults(prisma, league, now);
  const seasons = recentSeasons(now, 3);
  const testFrom = Date.parse(`${seasons[2].slice(0, 4)}-07-01T00:00:00Z`);
  const r = backtest(league, history, testFrom);
  if (r.rows.length < 100) return false;
  await prisma.modelBacktest.create({
    data: {
      modelVersionId: REAL_MODEL.ensemble.id,
      league,
      createdAt: new Date(now),
      testFrom: new Date(r.from),
      testTo: new Date(r.to),
      n: r.rows.length,
      summary: JSON.parse(JSON.stringify({ scores: r.scores, goals: r.goals, calibration: r.calibration })),
    },
  });
  return true;
}

export async function runModel(prisma: PrismaClient, opts: { oddsKeys: string[]; now?: number; fetchImpl?: typeof fetch; skipResultsRefresh?: boolean }): Promise<ModelRunSummary> {
  const now = opts.now ?? Date.now();
  const summary: ModelRunSummary = { resultsAdded: 0, predictions: 0, missing: [], outcomes: 0, settled: 0, backtests: [] };
  await ensureModelVersions(prisma, now);
  for (const key of opts.oddsKeys) {
    const league = leagueForOddsKey(key);
    if (!league) continue;
    if (!opts.skipResultsRefresh) summary.resultsAdded += await refreshResults(prisma, league.code, now, opts.fetchImpl);
    const p = await predictUpcoming(prisma, key, now);
    summary.predictions += p.predictions;
    summary.missing.push(...p.missing);
    if (await refreshBacktest(prisma, league.code, now)) summary.backtests.push(league.code);
  }
  const c = await closeAndSettle(prisma, now);
  summary.outcomes = c.outcomes;
  summary.settled = c.settled;
  return summary;
}
