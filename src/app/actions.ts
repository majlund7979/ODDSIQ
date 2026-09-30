"use server";

import { cookies } from "next/headers";
import { currentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { encodePositions, encodeWatchlist, findByNameOf, resolveWatchItemOf, toggleWatchItem, WATCH_KINDS, type Position, type WatchItem, type WatchKind } from "@/lib/demo/personal";
import { COOKIE_OPTIONS, POSITIONS_COOKIE, readPositions, readWatchlist, THRESHOLD_COOKIE, validThreshold, WATCH_COOKIE } from "@/lib/personal-store";
import { terminal } from "@/lib/terminal";

const isKind = (k: unknown): k is WatchKind => WATCH_KINDS.some((x) => x.kind === k);

async function saveWatchlist(items: WatchItem[]) {
  const user = await currentUser();
  if (user) await db().user.update({ where: { id: user.id }, data: { watchlist: encodeWatchlist(items) } });
  else (await cookies()).set(WATCH_COOKIE, encodeWatchlist(items), COOKIE_OPTIONS);
}

async function savePositions(ps: Position[]) {
  const user = await currentUser();
  if (user) await db().user.update({ where: { id: user.id }, data: { positions: encodePositions(ps) } });
  else (await cookies()).set(POSITIONS_COOKIE, encodePositions(ps), COOKIE_OPTIONS);
}

export async function toggleWatch(formData: FormData): Promise<void> {
  const kind = formData.get("kind");
  const id = String(formData.get("id") ?? "");
  if (!isKind(kind) || !resolveWatchItemOf({ kind, id }, await (await terminal()).personal())) return;
  await saveWatchlist(toggleWatchItem(await readWatchlist(), { kind, id }));
}

/** Adds a team or league by name (the /watch command). Returns what was added, or null. */
export async function watchByName(name: string): Promise<string | null> {
  const ctx = await (await terminal()).personal();
  const item = findByNameOf(name, ctx);
  if (!item) return null;
  const list = await readWatchlist();
  if (!list.some((i) => i.kind === item.kind && i.id === item.id)) await saveWatchlist([...list, item]);
  return resolveWatchItemOf(item, ctx)?.label ?? null;
}

export async function setThreshold(formData: FormData): Promise<void> {
  const v = Math.round(Number(formData.get("threshold")));
  if (!validThreshold(v)) return;
  const user = await currentUser();
  if (user) await db().user.update({ where: { id: user.id }, data: { thresholdPp: v } });
  else (await cookies()).set(THRESHOLD_COOKIE, String(v), COOKIE_OPTIONS);
}

/** Records the current best price for a selection as a tracked position. Only open pre-match markets. */
export async function trackPosition(formData: FormData): Promise<void> {
  const selectionId = String(formData.get("selectionId") ?? "");
  const t = await terminal();
  const now = t.now;
  const d = t.marketDetail(selectionId);
  if (!d || d.event.status !== "scheduled" || !Number.isFinite(d.row.bestOdds)) return;
  await savePositions([...(await readPositions()), { selectionId, odds: d.row.bestOdds, at: now }]);
}

export async function removePosition(formData: FormData): Promise<void> {
  const index = Number(formData.get("index"));
  const list = await readPositions();
  if (!Number.isInteger(index) || index < 0 || index >= list.length) return;
  await savePositions(list.filter((_, i) => i !== index));
}
