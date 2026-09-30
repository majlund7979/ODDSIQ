// Personal state (watchlist, assistant threshold, tracked positions). Signed-in
// users keep it on their account; everyone else keeps it in cookies in their
// own browser. Read here; written only by the server actions in src/app/actions.ts.

import { cookies } from "next/headers";
import { currentUser } from "@/lib/auth/session";
import { decodePositions, decodeWatchlist, type Position, type WatchItem } from "@/lib/demo/personal";

export const WATCH_COOKIE = "oddsiq_watch";
export const POSITIONS_COOKIE = "oddsiq_positions";
export const THRESHOLD_COOKIE = "oddsiq_threshold";
export const DEFAULT_THRESHOLD_PP = 5;
export const COOKIE_OPTIONS = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" as const, httpOnly: true };

export async function readWatchlist(): Promise<WatchItem[]> {
  const user = await currentUser();
  return decodeWatchlist(user ? user.watchlist : (await cookies()).get(WATCH_COOKIE)?.value);
}

export async function readPositions(): Promise<Position[]> {
  const user = await currentUser();
  return decodePositions(user ? user.positions : (await cookies()).get(POSITIONS_COOKIE)?.value);
}

export const validThreshold = (v: number) => Number.isFinite(v) && v >= 1 && v <= 30;

export async function readThreshold(): Promise<number> {
  const user = await currentUser();
  const v = user ? user.thresholdPp : Number((await cookies()).get(THRESHOLD_COOKIE)?.value);
  return validThreshold(v) ? v : DEFAULT_THRESHOLD_PP;
}
