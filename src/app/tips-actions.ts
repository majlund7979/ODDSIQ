"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isInvited } from "@/lib/auth/friends";
import { ACCOUNTS_ENABLED, currentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { saveTip } from "@/lib/real/tips";
import { terminal } from "@/lib/terminal";
import { isSide, weekMatches } from "@/lib/tips";

/** Saves the signed-in friend's 1, X or 2 on a match that has not kicked off. */
export async function setTip(formData: FormData): Promise<void> {
  const user = ACCOUNTS_ENABLED ? await currentUser() : null;
  if (!user || !(await isInvited(user.email))) redirect("/login?next=/tips");
  const pick = formData.get("pick");
  const eventId = String(formData.get("eventId") ?? "");
  if (!isSide(pick)) return;
  const t = await terminal();
  const match = weekMatches(t.marketRows(), { start: t.now, end: Infinity }).find((m) => m.eventId === eventId);
  if (match) await saveTip(db(), user.id, match, pick, Date.now());
  revalidatePath("/tips");
}
