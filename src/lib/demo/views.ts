import type { TableRow } from "@/components/MarketTable";
import { clvSegmentKey } from "./analytics";
import type { MarketRow } from "./store";

const SHORT_MARKET: Record<string, string> = {
  "Match Winner": "1X2",
  "Total Goals 2.5": "O/U 2.5",
  "Both Teams to Score": "BTTS",
  Moneyline: "Moneyline",
};

export function toTableRow(r: MarketRow): TableRow {
  return {
    selectionId: r.selectionId,
    sport: r.sport,
    league: r.league,
    match: r.match,
    kickoff: r.kickoff,
    status: r.status,
    minute: r.minute,
    score: r.score,
    market: r.sport === "Tennis" ? "Match Winner" : (SHORT_MARKET[r.market] ?? r.market),
    selection: r.selection,
    bestOdds: r.bestOdds,
    bestBook: r.bestBook,
    openingOdds: r.openingOdds,
    marketProbability: r.marketProbability,
    modelProbability: r.modelProbability,
    ciLow: r.ciLow,
    ciHigh: r.ciHigh,
    inPlayModel: r.inPlayModel,
    edgePp: r.edgePp,
    ev: r.ev,
    movement: r.movement,
    pressure: r.pressure.score,
    pressureLevel: r.pressure.level,
    confidence: r.confidence,
    dataQuality: r.dataQuality.score,
  };
}

export interface ScannerRow {
  selectionId: string;
  sportId: string;
  sport: string;
  leagueId: string;
  league: string;
  match: string;
  kickoff: number;
  market: string;
  selection: string;
  bestOdds: number;
  bestBook: string;
  bestBookId: string | null;
  marketProbability: number;
  modelProbability: number;
  ciLow: number;
  ciHigh: number;
  edgePp: number;
  ev: number;
  confidence: number;
  movement: number;
  modelDisagreement: string;
  modelStdevPp: number;
  dataQuality: number;
  clvHistory: number | null;
  clvHistoryN: number;
  signals: ("SHARP" | "RLM")[];
}

export function toScannerRow(r: MarketRow, clvHistory: Map<string, { avg: number; n: number }>, signals: ("SHARP" | "RLM")[]): ScannerRow | null {
  if (r.status !== "scheduled" || r.modelProbability === null || r.edgePp === null || r.ev === null) return null;
  const h = clvHistory.get(clvSegmentKey(r.leagueId, r.marketType));
  return {
    selectionId: r.selectionId,
    sportId: r.sportId,
    sport: r.sport,
    leagueId: r.leagueId,
    league: r.league,
    match: r.match,
    kickoff: r.kickoff,
    market: r.sport === "Tennis" ? "Match Winner" : (SHORT_MARKET[r.market] ?? r.market),
    selection: r.selection,
    bestOdds: r.bestOdds,
    bestBook: r.bestBook,
    bestBookId: r.bestBookId,
    marketProbability: r.marketProbability,
    modelProbability: r.modelProbability,
    ciLow: r.ciLow ?? r.modelProbability,
    ciHigh: r.ciHigh ?? r.modelProbability,
    edgePp: r.edgePp,
    ev: r.ev,
    confidence: r.confidence ?? 0,
    movement: r.movement,
    modelDisagreement: r.modelDisagreement ?? "—",
    modelStdevPp: r.modelStdevPp ?? 0,
    dataQuality: r.dataQuality.score,
    clvHistory: h?.avg ?? null,
    clvHistoryN: h?.n ?? 0,
    signals,
  };
}
