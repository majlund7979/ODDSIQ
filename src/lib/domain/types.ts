// Core domain model. These types mirror prisma/schema.prisma so the demo store
// and the database-backed store can share one repository interface.

export type SportId = "football" | "basketball" | "tennis" | "american-football" | "ice-hockey";

export interface Sport {
  id: SportId;
  name: string;
}

export interface League {
  id: string;
  sportId: SportId;
  name: string;
  country: string;
}

export interface Team {
  id: string;
  leagueId: string;
  name: string;
  shortName: string;
  /** Latent attacking / defensive strength used by the demo generator. */
  attack: number;
  defence: number;
}

export interface Bookmaker {
  id: string;
  name: string;
  /** Typical overround (e.g. 0.05 = 5% margin). */
  margin: number;
  /** 0-1: how reliably this feed delivers fresh prices. */
  reliability: number;
}

export type EventStatus = "scheduled" | "live" | "finished";

export interface SportEvent {
  id: string;
  sportId: SportId;
  leagueId: string;
  homeTeamId: string;
  awayTeamId: string;
  kickoff: number; // epoch ms
  status: EventStatus;
  /** Final (finished) or current (live) score. */
  score?: { home: number; away: number };
  /** Minute of play for live events. */
  minute?: number;
  lineupConfirmedAt?: number;
  injuriesUpdatedAt?: number;
  statsUpdatedAt?: number;
}

/** DC = double chance (1x, x2, 12); only real feeds carry it. */
export type MarketType = "1X2" | "OU15" | "OU25" | "BTTS" | "ML" | "DC";

export interface Market {
  id: string;
  eventId: string;
  type: MarketType;
  name: string;
  suspended: boolean;
}

export interface Selection {
  id: string;
  marketId: string;
  eventId: string;
  name: string;
  /** Outcome once the event is settled. */
  result?: "won" | "lost" | "void";
}

/**
 * Price history for one selection. Time points are shared by all bookmakers;
 * a NaN price means that bookmaker had no quote at that time.
 */
export interface OddsSeries {
  selectionId: string;
  times: number[];
  prices: Record<string, number[]>; // bookmakerId -> decimal odds per time point
}

export interface ModelFamily {
  id: string;
  name: string;
  kind: "poisson" | "gbm" | "elo" | "neural" | "ensemble";
  description: string;
}

export interface ModelVersion {
  id: string; // e.g. football-ensemble-v1.4
  familyId: string;
  version: string;
  releasedAt: number;
  trainingFrom: number;
  trainingTo: number;
  features: string[];
  notes: string;
}

export interface ExplanationFactor {
  label: string;
  value: string;
  /** Signed contribution to the probability in percentage points. */
  contributionPp: number;
}

/** A model's current (mutable, re-computed) view of a selection. Not the ledger. */
export interface ModelEstimate {
  selectionId: string;
  modelVersionId: string;
  probability: number;
  ciLow: number;
  ciHigh: number;
  computedAt: number;
}

export interface SelectionAnalysis {
  selectionId: string;
  ensemble: ModelEstimate;
  components: ModelEstimate[];
  factors: ExplanationFactor[];
}

/**
 * Immutable ledger entry. Once written, none of these fields may change.
 * Closing odds and results live in PredictionOutcome, never on this record.
 */
export interface Prediction {
  id: string;
  seq: number;
  createdAt: number;
  eventId: string;
  marketId: string;
  selectionId: string;
  modelVersionId: string;
  probability: number;
  ciLow: number;
  ciHigh: number;
  confidence: number; // 0-100
  odds: number; // best available price when the prediction was recorded
  bookmakerId: string;
  prevHash: string;
  hash: string;
}

export interface PredictionOutcome {
  predictionId: string;
  closingOdds: number;
  /** De-vigged closing probability of the selection. */
  closingFairProbability: number;
  result: "won" | "lost" | "void";
  settledAt: number;
}

export type LiveEventKind = "goal" | "yellow" | "red" | "substitution" | "shot" | "corner" | "var";

export interface LiveEvent {
  eventId: string;
  minute: number;
  kind: LiveEventKind;
  team: "home" | "away";
  description: string;
  /** Home-win probability before and after, when the event moved it. */
  modelBefore?: number;
  modelAfter?: number;
}

export interface ProbabilityPoint {
  minute: number;
  model: number;
  market: number;
}

export interface DataSource {
  id: string;
  name: string;
  kind: "odds" | "stats" | "lineups" | "injuries";
  status: "ok" | "degraded" | "down";
  lastSyncAt: number;
}
