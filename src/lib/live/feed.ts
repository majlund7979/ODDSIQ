// Where the live scores on /picks and /api/live come from: the demo replay
// (DEMO DATA), or the recorded picks with API-Football's scores.

import { DEMO_MODE } from "@/lib/data";
import { db, DATABASE_CONFIGURED } from "@/lib/db";
import { demoLivePicks } from "@/lib/demo/picks";
import { livePicks, type LivePick } from "./scores";

/** One bet type's picks being played now, with their live score. Async, so a failure in either source is a rejection. */
export async function livePicksFor(category: string, now: number): Promise<LivePick[]> {
  if (DEMO_MODE) return demoLivePicks(category, now);
  return DATABASE_CONFIGURED ? livePicks(db(), process.env.STATS_API_KEY || null, category, now) : [];
}
