// Data access entry point for server components. DEMO_MODE (the default until
// a licensed odds feed is connected) serves the deterministic demo universe.

import { connection } from "next/server";

/**
 * DEMO_MODE=false (also "False", "0", "no", "off", with or without quotes)
 * switches to live data. Left unset, the site goes live by itself once the
 * database and the odds feed are configured.
 */
export function demoModeFrom(env: Record<string, string | undefined>): boolean {
  const raw = (env.DEMO_MODE ?? "").trim().replace(/^["']|["']$/g, "").trim().toLowerCase();
  if (!raw) return !(env.DATABASE_URL && env.ODDS_API_KEY);
  return !["false", "0", "no", "off", "nej"].includes(raw);
}

export const DEMO_MODE = demoModeFrom(process.env);

export class DataSourceNotConfiguredError extends Error {
  constructor() {
    super("DEMO_MODE is off but DATABASE_URL is not set. Set DEMO_MODE=true, or connect the database and odds feed.");
  }
}

/** Request time for pages that work in any mode (/admin, /admin/modelpanel, /nyheder). Awaiting connection() keeps them out of static prerendering. */
export async function wallClock(): Promise<number> {
  await connection();
  return Date.now();
}
