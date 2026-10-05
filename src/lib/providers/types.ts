// Provider-neutral shapes for a licensed odds feed. Adapters (e.g. The Odds
// API) translate their responses into these; ingestion only sees these.

/** DC = double chance: 1x (home or draw), x2 (draw or away), 12 (no draw). */
export type FeedMarketType = "1X2" | "ML" | "OU15" | "OU25" | "BTTS" | "DC";

export interface FeedCompetition {
  key: string;
  sportId: string;
  name: string;
  group: string;
  active: boolean;
}

export interface FeedPrice {
  bookmakerKey: string;
  bookmakerName: string;
  /** When the bookmaker last changed any price in this market, per the provider. */
  lastUpdate: number;
  market: FeedMarketType;
  /** home | draw | away | over | under | yes | no | 1x | x2 | 12 */
  selection: string;
  odds: number;
}

export interface FeedEvent {
  externalId: string;
  competitionKey: string;
  kickoff: number;
  home: string;
  away: string;
  prices: FeedPrice[];
}

export interface FeedResult {
  externalId: string;
  competitionKey: string;
  kickoff: number;
  completed: boolean;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
}

export interface FeedQuota {
  used: number | null;
  remaining: number | null;
  last: number | null;
}

export interface FeedResponse<T> {
  data: T;
  quota: FeedQuota;
}

export interface OddsFeed {
  readonly provider: string;
  readonly providerName: string;
  competitions(): Promise<FeedResponse<FeedCompetition[]>>;
  odds(competitionKey: string): Promise<FeedResponse<FeedEvent[]>>;
  /** Kickoff times of upcoming events, without prices. Free on The Odds API, so runs can skip competitions with nothing on soon. */
  upcoming(competitionKey: string): Promise<FeedResponse<number[]>>;
  results(competitionKey: string, daysFrom: number): Promise<FeedResponse<FeedResult[]>>;
}
