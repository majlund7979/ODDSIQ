// Per-browser personal state (watchlist, assistant threshold, tracked positions)
// kept in cookies until accounts arrive in phase 9. Read here; written only by
// the server actions in src/app/actions.ts.

import { cookies } from "next/headers";
import { decodePositions, decodeWatchlist, type Position, type WatchItem } from "@/lib/demo/personal";

export const WATCH_COOKIE = "oddsiq_watch";
export const POSITIONS_COOKIE = "oddsiq_positions";
export const THRESHOLD_COOKIE = "oddsiq_threshold";
export const DEFAULT_THRESHOLD_PP = 5;
export const COOKIE_OPTIONS = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" as const, httpOnly: true };

export async function readWatchlist(): Promise<WatchItem[]> {
  return decodeWatchlist((await cookies()).get(WATCH_COOKIE)?.value);
}

export async function readPositions(): Promise<Position[]> {
  return decodePositions((await cookies()).get(POSITIONS_COOKIE)?.value);
}

export async function readThreshold(): Promise<number> {
  const v = Number((await cookies()).get(THRESHOLD_COOKIE)?.value);
  return Number.isFinite(v) && v >= 1 && v <= 30 ? v : DEFAULT_THRESHOLD_PP;
}
