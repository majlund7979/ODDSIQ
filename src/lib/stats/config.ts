// Statistics feed settings. Nothing is fetched unless STATS_API_KEY is set.

import { ApiFootballFeed } from "./api-football";

/** API-Football's free plan allows 100 requests a day; four runs a day at 20 each stay inside it. */
export const STATS_DEFAULT_BUDGET = 20;

export function statsConfig(env: Record<string, string | undefined> = process.env) {
  const budget = Number(env.STATS_MAX_REQUESTS_PER_RUN);
  return { apiKey: env.STATS_API_KEY || null, budget: Number.isInteger(budget) && budget > 0 ? budget : STATS_DEFAULT_BUDGET };
}

export function configuredStatsFeed(env: Record<string, string | undefined> = process.env): ApiFootballFeed | null {
  const c = statsConfig(env);
  return c.apiKey ? new ApiFootballFeed({ apiKey: c.apiKey }) : null;
}
