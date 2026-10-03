"use server";

import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth/redirect";
import { ACCOUNTS_ENABLED, currentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { MAX_STAKE, parseNumber } from "@/lib/friends";
import { deleteFriendBet, findDraft, saveFriendBet } from "@/lib/real/friend-bets";
import { terminal } from "@/lib/terminal";

const withFlag = (path: string, key: string, value: string) => `${path}${path.includes("?") ? "&" : "?"}${key}=${value}`;

async function signedIn(back: string) {
  const user = ACCOUNTS_ENABLED ? await currentUser() : null;
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
  redirect(back);
}

/** Name in the league and the morning e-mail on or off. */
export async function updateLeagueProfile(formData: FormData): Promise<void> {
  const user = await signedIn("/picks/liga");
  const name = String(formData.get("displayName") ?? "").trim().slice(0, 30);
  await db().user.update({ where: { id: user.id }, data: { displayName: name || null, morningEmail: formData.get("morningEmail") === "on" } });
  redirect("/picks/liga?gemt=profil");
}
