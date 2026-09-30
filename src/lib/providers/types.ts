// Provider-neutral shapes for a licensed odds feed. Adapters (e.g. The Odds
// API) translate their responses into these; ingestion only sees these.

export type FeedMarketType = "1X2" | "ML" | "OU25";

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
  /** home | draw | away | over | under */
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
  results(competitionKey: string, daysFrom: number): Promise<FeedResponse<FeedResult[]>>;
}
