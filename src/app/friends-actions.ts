"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { requireFriend, signedInFriend } from "@/lib/auth/friends";
import { safeNext } from "@/lib/auth/redirect";
import { db } from "@/lib/db";
import { MAX_STAKE, parseNumber } from "@/lib/friends";
import type { PickDraft } from "@/lib/picks-extra";
import { deleteFriendBet, findDraft, findDrafts, saveFriendBet } from "@/lib/real/friend-bets";
import { couponTotals, deleteFriendCoupon, MAX_COUPON_LEGS, MIN_COUPON_LEGS, saveFriendCoupon } from "@/lib/real/friend-coupons";
import { SAVE_FAILED } from "@/lib/save-failed";
import { terminal } from "@/lib/terminal";

const withFlag = (path: string, key: string, value: string) => `${path}${path.includes("?") ? "&" : "?"}${key}=${value}`;

/** The signed-in, invited user; everyone else is sent to /login. */
async function signedIn(back: string) {
  const user = await requireFriend(back);
  if (!user) redirect(`/login?next=${encodeURIComponent(back)}`);
  return user;
}

/** Saves the pick shown for a match and bet type to the friends' league, with the friend's own stake and odds. */
export async function saveBet(formData: FormData): Promise<void> {
  const back = safeNext(formData.get("back"));
  const user = await signedIn(back);
  const t = await terminal();
  const draft = findDraft(t, String(formData.get("eventId") ?? ""), String(formData.get("category") ?? ""));
  const stake = parseNumber(formData.get("stake"));
  const odds = parseNumber(formData.get("odds"));
  if (!draft) redirect(withFlag(back, "gemt", "lukket"));
  if (stake === null || stake < 1 || stake > MAX_STAKE || (odds !== null && (odds < 1.01 || odds > 1000))) redirect(withFlag(back, "gemt", "fejl"));
  await saveFriendBet(db(), user.id, draft, odds, Math.round(stake));
  redirect(withFlag(back, "gemt", "ok"));
}

export async function deleteBet(formData: FormData): Promise<void> {
  const back = safeNext(formData.get("back"), "/picks/liga");
  const user = await signedIn(back);
  const id = String(formData.get("id") ?? "");
  if (/^\d+$/.test(id)) await deleteFriendBet(db(), user.id, BigInt(id), Date.now());
  else if (/^k\d+$/.test(id)) await deleteFriendCoupon(db(), user.id, BigInt(id.slice(1)), Date.now());
  redirect(back);
}

export interface PlayState {
  ok?: string;
  error?: string;
}

/** "Spil kupon": saves the coupon to the friends' league as one bet; every leg is looked up again on the server. */
export async function playCoupon(_: PlayState, formData: FormData): Promise<PlayState> {
  try {
    const user = await signedInFriend();
    if (!user) return { error: "Log ind for at spille kuponen." };
    let raw: unknown;
    try {
      raw = JSON.parse(String(formData.get("legs") ?? "[]"));
    } catch {
      raw = [];
    }
    const legs = (Array.isArray(raw) ? raw : []).slice(0, MAX_COUPON_LEGS + 1).map((l) => ({ eventId: String(l?.eventId ?? ""), category: String(l?.category ?? "") }));
    if (legs.length < MIN_COUPON_LEGS) return { error: `En kupon skal have mindst ${MIN_COUPON_LEGS} bets.` };
    if (legs.length > MAX_COUPON_LEGS) return { error: `Højst ${MAX_COUPON_LEGS} bets på en kupon.` };
    if (new Set(legs.map((l) => l.eventId)).size !== legs.length) return { error: "Kun ét bet pr. kamp på en kupon." };
    const stake = parseNumber(formData.get("stake"));
    const odds = parseNumber(formData.get("odds"));
    if (stake === null || stake < 1 || stake > MAX_STAKE) return { error: "Skriv en indsats mellem 1 og 100.000 kr." };
    if (odds !== null && (odds < 1.01 || odds > 100_000)) return { error: "Tjek den samlede odds." };
    const t = await terminal();
    const drafts = findDrafts(t, legs);
    if (drafts.some((d) => !d)) return { error: "Et af bettene er ikke åbent længere. Fjern det og prøv igen." };
    const found = drafts as PickDraft[];
    await saveFriendCoupon(db(), user.id, found, odds ?? couponTotals(found).odds, Math.round(stake));
    revalidatePath("/picks/liga");
    return { ok: "Kuponen er spillet og gemt under bets i vennerligaen." };
  } catch (e) {
    unstable_rethrow(e);
    console.error(e);
    return { error: SAVE_FAILED };
  }
}

/** Name in the league and the morning e-mail on or off. */
export async function updateLeagueProfile(formData: FormData): Promise<void> {
  const user = await signedIn("/picks/liga");
  const name = String(formData.get("displayName") ?? "").trim().slice(0, 30);
  await db().user.update({ where: { id: user.id }, data: { displayName: name || null, morningEmail: formData.get("morningEmail") === "on" } });
  redirect("/picks/liga?gemt=profil");
}
