import type { TableRow } from "@/components/MarketTable";
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
