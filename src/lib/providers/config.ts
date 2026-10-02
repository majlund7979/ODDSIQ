// Feed settings from the environment. Nothing is fetched unless ODDS_API_KEY is set.

import { DEFAULT_ODDS_PLAN, type OddsPlan } from "./ingest";
import { TheOddsApiFeed } from "./the-odds-api";

/** Top 5 leagues, the Danish Superliga and the Champions League (Mads, 2026-10-02). */
export const DEFAULT_SPORTS = [
  "soccer_epl",
  "soccer_spain_la_liga",
  "soccer_germany_bundesliga",
  "soccer_italy_serie_a",
  "soccer_france_ligue_one",
  "soccer_denmark_superliga",
  "soccer_uefa_champs_league",
];
export const FEED_DEFAULTS = { sports: DEFAULT_SPORTS.join(","), regions: "eu", markets: "h2h" };

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
    /** Credits one odds call costs. */
    oddsCost: regions.length * (markets.length || 1),
  };
}

/** How scheduled runs spend credits; ODDS_MIN_HOURS sets the minimum hours between two odds calls for one league. */
export function oddsPlan(env: Record<string, string | undefined> = process.env): OddsPlan {
  const h = Number(env.ODDS_MIN_HOURS);
  return { ...DEFAULT_ODDS_PLAN, ...(env.ODDS_MIN_HOURS && Number.isFinite(h) && h >= 0 ? { minIntervalMs: h * 3_600_000 } : {}), oddsCost: feedConfig(env).oddsCost };
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
