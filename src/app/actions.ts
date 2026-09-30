"use server";

import { cookies } from "next/headers";
import { encodePositions, encodeWatchlist, findByName, resolveWatchItem, toggleWatchItem, WATCH_KINDS, type WatchKind } from "@/lib/demo/personal";
import { marketDetail } from "@/lib/demo/store";
import { COOKIE_OPTIONS, POSITIONS_COOKIE, readPositions, readWatchlist, THRESHOLD_COOKIE, WATCH_COOKIE } from "@/lib/personal-store";

const isKind = (k: unknown): k is WatchKind => WATCH_KINDS.some((x) => x.kind === k);

export async function toggleWatch(formData: FormData): Promise<void> {
  const kind = formData.get("kind");
  const id = String(formData.get("id") ?? "");
  if (!isKind(kind) || !resolveWatchItem({ kind, id }, Date.now())) return;
  const next = toggleWatchItem(await readWatchlist(), { kind, id });
  (await cookies()).set(WATCH_COOKIE, encodeWatchlist(next), COOKIE_OPTIONS);
}

/** Adds a team or league by name (the /watch command). Returns what was added, or null. */
export async function watchByName(name: string): Promise<string | null> {
  const item = findByName(name);
  if (!item) return null;
  const list = await readWatchlist();
  if (!list.some((i) => i.kind === item.kind && i.id === item.id)) (await cookies()).set(WATCH_COOKIE, encodeWatchlist([...list, item]), COOKIE_OPTIONS);
  return resolveWatchItem(item, Date.now())?.label ?? null;
}

export async function setThreshold(formData: FormData): Promise<void> {
  const v = Math.round(Number(formData.get("threshold")));
  if (Number.isFinite(v) && v >= 1 && v <= 30) (await cookies()).set(THRESHOLD_COOKIE, String(v), COOKIE_OPTIONS);
}

/** Records the current best price for a selection as a tracked position. Only open pre-match markets. */
export async function trackPosition(formData: FormData): Promise<void> {
  const selectionId = String(formData.get("selectionId") ?? "");
  const now = Date.now();
  const d = marketDetail(selectionId, now);
  if (!d || d.event.status !== "scheduled" || !Number.isFinite(d.row.bestOdds)) return;
  const list = await readPositions();
  (await cookies()).set(POSITIONS_COOKIE, encodePositions([...list, { selectionId, odds: d.row.bestOdds, at: now }]), COOKIE_OPTIONS);
}

export async function removePosition(formData: FormData): Promise<void> {
  const index = Number(formData.get("index"));
  const list = await readPositions();
  if (!Number.isInteger(index) || index < 0 || index >= list.length) return;
  (await cookies()).set(POSITIONS_COOKIE, encodePositions(list.filter((_, i) => i !== index)), COOKIE_OPTIONS);
}
