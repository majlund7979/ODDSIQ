// Read model for the Real Model page.

import type { PrismaClient } from "@/generated/prisma/client";
import { clv } from "@/lib/metrics/clv";
import { brierScore } from "@/lib/metrics/scoring";
import type { CalibrationBin } from "@/lib/metrics/scoring";
import { closingLine } from "@/lib/providers/closing";
import { backtest, type BacktestResult, type ModelScore } from "./backtest";
import { EPL_RESULTS_CSV, EPL_SNAPSHOT_THROUGH } from "./data/epl-2021-2026";
import { REAL_MODEL } from "./ensemble";
import { OPENFOOTBALL_SOURCE, parseResultsCsv, RESULT_LEAGUES } from "./openfootball";

export interface BacktestView {
  league: string;
  leagueName: string;
  source: string;
  createdAt: number | null;
  from: number;
  to: number;
  n: number;
  scores: BacktestResult["scores"];
  goals: BacktestResult["goals"];
  calibration: CalibrationBin[];
}

const leagueName = (code: string) => RESULT_LEAGUES.find((l) => l.code === code)?.name ?? code;

let snapshotMemo: BacktestView | null = null;

/** Backtest on the committed Premier League snapshot: always available, even without a database. */
export function snapshotBacktest(): BacktestView {
  if (!snapshotMemo) {
    const r = backtest("en.1", parseResultsCsv("en.1", EPL_RESULTS_CSV), Date.parse("2023-07-01T00:00:00Z"));
    snapshotMemo = {
      league: "en.1",
      leagueName: leagueName("en.1"),
      source: `${OPENFOOTBALL_SOURCE}, snapshot to ${EPL_SNAPSHOT_THROUGH}`,
      createdAt: null,
      from: r.from,
      to: r.to,
      n: r.rows.length,
      scores: r.scores,
      goals: r.goals,
      calibration: r.calibration,
    };
  }
  return snapshotMemo;
}

export async function storedBacktests(prisma: PrismaClient): Promise<BacktestView[]> {
  const rows = await prisma.modelBacktest.findMany({ where: { modelVersionId: REAL_MODEL.ensemble.id }, orderBy: { createdAt: "desc" }, take: 50 });
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.league)) latest.set(r.league, r);
  return [...latest.values()].map((r) => {
    const s = r.summary as unknown as { scores: BacktestResult["scores"]; goals: BacktestResult["goals"]; calibration: CalibrationBin[] };
    return { league: r.league, leagueName: leagueName(r.league), source: OPENFOOTBALL_SOURCE, createdAt: r.createdAt.getTime(), from: r.testFrom.getTime(), to: r.testTo.getTime(), n: r.n, ...s };
  });
}

export interface LivePrediction {
  id: string;
  createdAt: number;
  kickoff: number;
  match: string;
  league: string;
  market: string;
  selection: string;
  probability: number;
  ciLow: number;
  ciHigh: number;
  confidence: number;
  odds: number;
  bookmaker: string;
  /** De-vigged consensus at the time of the prediction. */
  marketProbability: number | null;
  closingFairProbability: number | null;
  clv: number | null;
  result: string | null;
}

export interface LiveSummary {
  predictions: number;
  withClose: number;
  settled: number;
  avgClv: number | null;
  brierModel: number | null;
  brierMarket: number | null;
  periodFrom: number | null;
  periodTo: number | null;
}

export async function livePredictions(prisma: PrismaClient): Promise<{ rows: LivePrediction[]; summary: LiveSummary; missing: { match: string; reason: string; kickoff: number }[] }> {
  const preds = await prisma.prediction.findMany({
    where: { modelVersionId: REAL_MODEL.ensemble.id },
    orderBy: { seq: "desc" },
    take: 400,
    include: { outcome: true, bookmaker: true, selection: { include: { market: { include: { selections: true, event: { include: { homeTeam: true, awayTeam: true, league: true } } } } } } },
  });

  const rows: LivePrediction[] = [];
  for (const p of preds) {
    const m = p.selection.market;
    const ids = m.selections.map((s) => s.id);
    const snaps = await prisma.oddsSnapshot.findMany({ where: { selectionId: { in: ids }, observedAt: { lte: p.createdAt } }, select: { bookmakerId: true, selectionId: true, observedAt: true, odds: true } });
    const at = closingLine(
      snaps.map((s) => ({ ...s, observedAt: s.observedAt.getTime(), odds: Number(s.odds) })),
      ids,
      p.createdAt.getTime(),
    );
    const o = p.outcome;
    const odds = Number(p.odds);
    rows.push({
      id: p.id,
      createdAt: p.createdAt.getTime(),
      kickoff: m.event.kickoff.getTime(),
      match: `${m.event.homeTeam.name} v ${m.event.awayTeam.name}`,
      league: m.event.league.name,
      market: m.type,
      selection: p.selection.name,
      probability: p.probability,
      ciLow: p.ciLow,
      ciHigh: p.ciHigh,
      confidence: p.confidence,
      odds,
      bookmaker: p.bookmaker.name,
      marketProbability: at?.selections.find((s) => s.selectionId === p.selectionId)?.fairProbability ?? null,
      closingFairProbability: o ? o.closingFairProbability : null,
      clv: o ? clv(odds, o.closingFairProbability) : null,
      result: o?.result ?? null,
    });
  }

  const settled = rows.filter((r) => r.result === "won" || r.result === "lost");
  const closed = rows.filter((r) => r.clv !== null);
  const y = (r: LivePrediction) => (r.result === "won" ? 1 : 0) as 0 | 1;
  const times = rows.map((r) => r.createdAt);
  const summary: LiveSummary = {
    predictions: rows.length,
    withClose: closed.length,
    settled: settled.length,
    avgClv: closed.length ? closed.reduce((s, r) => s + r.clv!, 0) / closed.length : null,
    brierModel: settled.length ? brierScore(settled.map((r) => ({ p: r.probability, y: y(r) }))) : null,
    brierMarket: settled.length ? brierScore(settled.map((r) => ({ p: r.closingFairProbability!, y: y(r) }))) : null,
    periodFrom: times.length ? Math.min(...times) : null,
    periodTo: times.length ? Math.max(...times) : null,
  };

  const missingRows = await prisma.missingPrediction.findMany({ orderBy: { kickoff: "desc" }, take: 20 });
  const events = await prisma.event.findMany({ where: { id: { in: missingRows.map((r) => r.eventId) }, externalId: { not: null } }, include: { homeTeam: true, awayTeam: true } });
  const byId = new Map(events.map((e) => [e.id, e]));
  const seen = new Set<string>();
  const missing = missingRows
    .filter((r) => byId.has(r.eventId) && !seen.has(r.eventId) && seen.add(r.eventId))
    .map((r) => ({ match: `${byId.get(r.eventId)!.homeTeam.name} v ${byId.get(r.eventId)!.awayTeam.name}`, reason: r.reason, kickoff: r.kickoff.getTime() }));
  return { rows, summary, missing };
}

export type { ModelScore };
