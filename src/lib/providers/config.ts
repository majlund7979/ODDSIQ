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

/** In-play polling (GET /api/cron/live). Off unless ODDS_LIVE=on, because it spends credits every few minutes while matches are on. */
export function liveConfig(env: Record<string, string | undefined> = process.env) {
  const num = (v: string | undefined, d: number, min: number) => {
    const n = Number(v);
    return v && Number.isFinite(n) ? Math.max(min, Math.floor(n)) : d;
  };
  const c = feedConfig(env);
  return {
    enabled: ["on", "true", "1"].includes((env.ODDS_LIVE ?? "").toLowerCase()),
    /** Minimum minutes between live runs. */
    intervalMinutes: num(env.ODDS_LIVE_INTERVAL_MINUTES, 10, 2),
    /** Live runs stop when the feed reports fewer credits left than this, so the six-hourly runs keep working. */
    reserve: num(env.ODDS_LIVE_RESERVE, 100, 0),
    /** Credits per competition in play: odds, plus 2 for scores. */
    creditsPerCompetition: (c.regions.split(",").length * c.markets.split(",").length) + 2,
  };
}

export type LiveDecision = { run: true } | { run: false; reason: string };

/** Whether a live run should call the feed now. Makes no feed calls itself. */
export function liveRunDecision(cfg: ReturnType<typeof liveConfig>, s: { inPlay: number; lastLiveRunAt: number | null; creditsRemaining: number | null; now: number }): LiveDecision {
  if (!cfg.enabled) return { run: false, reason: "ODDS_LIVE is off." };
  if (s.inPlay === 0) return { run: false, reason: "No matches in play." };
  if (s.lastLiveRunAt !== null && s.now - s.lastLiveRunAt < (cfg.intervalMinutes * 60 - 30) * 1000) return { run: false, reason: `Last live run was under ${cfg.intervalMinutes} minutes ago.` };
  if (s.creditsRemaining !== null && s.creditsRemaining < cfg.reserve) return { run: false, reason: `Only ${s.creditsRemaining} credits left, below the reserve of ${cfg.reserve}.` };
  return { run: true };
}
