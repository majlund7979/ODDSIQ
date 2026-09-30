// Feed settings from the environment. Nothing is fetched unless ODDS_API_KEY is set.

import { TheOddsApiFeed } from "./the-odds-api";

export const FEED_DEFAULTS = { sports: "soccer_epl", regions: "eu", markets: "h2h" };

export function feedConfig(env: Record<string, string | undefined> = process.env) {
  const list = (v: string | undefined, d: string) =>
    (v || d)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  const sports = list(env.ODDS_SPORTS, FEED_DEFAULTS.sports);
  const regions = list(env.ODDS_REGIONS, FEED_DEFAULTS.regions);
  const markets = list(env.ODDS_MARKETS, FEED_DEFAULTS.markets).filter((m) => m === "h2h" || m === "totals");
  return {
    apiKey: env.ODDS_API_KEY || null,
    sports,
    regions: regions.join(","),
    markets: (markets.length ? markets : ["h2h"]).join(","),
    /** Credits one run spends on odds (results are extra, only when games need settling). */
    creditsPerRun: sports.length * regions.length * (markets.length || 1),
  };
}

export function configuredFeed(env: Record<string, string | undefined> = process.env): TheOddsApiFeed | null {
  const c = feedConfig(env);
  return c.apiKey ? new TheOddsApiFeed({ apiKey: c.apiKey, regions: c.regions, markets: c.markets }) : null;
}
