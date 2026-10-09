"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { isInvited } from "@/lib/auth/friends";
import { ACCOUNTS_ENABLED, currentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { saveTip } from "@/lib/real/tips";
import { SAVE_FAILED } from "@/lib/save-failed";
import { terminal } from "@/lib/terminal";
import { isSide, weekMatches } from "@/lib/tips";

/** Saves the signed-in friend's 1, X or 2 on a match that has not kicked off; the error says why it was not saved. */
export async function setTip(formData: FormData): Promise<{ error?: string }> {
  const user = ACCOUNTS_ENABLED ? await currentUser() : null;
  if (!user || !(await isInvited(user.email))) redirect("/login?next=/tips");
  const pick = formData.get("pick");
  const eventId = String(formData.get("eventId") ?? "");
  if (!isSide(pick)) return {};
  try {
    const t = await terminal();
    const match = weekMatches(t.marketRows(), { start: t.now, end: Infinity }).find((m) => m.eventId === eventId);
    if (match) await saveTip(db(), user.id, match, pick, Date.now());
    revalidatePath("/tips");
    return match ? {} : { error: "Kampen er gået i gang." };
  } catch (e) {
    unstable_rethrow(e);
    console.error(e);
    return { error: SAVE_FAILED };
  }
}
