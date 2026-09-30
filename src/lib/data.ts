// Data access entry point for server components. DEMO_MODE (the default until
// a licensed odds feed is connected) serves the deterministic demo universe.

import { connection } from "next/server";

export const DEMO_MODE = process.env.DEMO_MODE !== "false";

export class DataSourceNotConfiguredError extends Error {
  constructor() {
    super("DEMO_MODE is off but no live data provider is configured yet. Set DEMO_MODE=true or connect an odds provider.");
  }
}

/** Request time. Awaiting connection() keeps these pages out of static prerendering. */
export async function requestNow(): Promise<number> {
  await connection();
  if (!DEMO_MODE) throw new DataSourceNotConfiguredError();
  return Date.now();
}

/** Request time for pages that work in any mode (e.g. the live Data Feed page). */
export async function wallClock(): Promise<number> {
  await connection();
  return Date.now();
}
