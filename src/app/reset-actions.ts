"use server";

import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { isInvited, normaliseEmail } from "@/lib/auth/friends";
import { allowAttempt, hashPassword } from "@/lib/auth/password";
import { createReset, resetMail, consumeReset } from "@/lib/auth/reset";
import { passwordProblem } from "@/lib/auth/rules";
import { ACCOUNTS_ENABLED, createSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { MAIL_CONFIGURED, sendMails } from "@/lib/mail";
import { RESET_LINK_FAILED, SAVE_FAILED } from "@/lib/save-failed";
import { siteOrigin } from "@/lib/site-url";

export interface ResetState {
  error?: string;
  sent?: boolean;
  email?: string;
}

const TOO_MANY = "For mange forsøg. Prøv igen om 15 minutter.";

/** Sends a link when the account exists. The answer is the same either way, so the form does not reveal who has an account. */
export async function requestReset(_: ResetState, formData: FormData): Promise<ResetState> {
  if (!ACCOUNTS_ENABLED) return { error: "Login er ikke slået til endnu." };
  if (!MAIL_CONFIGURED) return { error: "Sitet kan ikke sende mails lige nu. Skriv til ejeren af siden." };
  const email = normaliseEmail(String(formData.get("email") ?? ""));
  if (!email.includes("@")) return { email, error: "Skriv den email, du er oprettet med." };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (![`reset-ip:${ip}`, `reset-email:${email}`].every((k) => allowAttempt(k))) return { email, error: TOO_MANY };
  try {
    const user = await db().user.findUnique({ where: { email }, select: { id: true } });
    if (user && (await isInvited(email))) {
      const token = await createReset(user.id);
      if (token) {
        const { error } = await sendMails([resetMail({ to: email, link: `${await siteOrigin()}/login/ny-kode?token=${token}` })]);
        if (error) console.error(`password reset mail failed: ${error}`);
      }
    }
  } catch (e) {
    unstable_rethrow(e);
    console.error(e);
    return { email, error: RESET_LINK_FAILED };
  }
  return { email, sent: true };
}

export async function resetPassword(_: ResetState, formData: FormData): Promise<ResetState> {
  if (!ACCOUNTS_ENABLED) return { error: "Login er ikke slået til endnu." };
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  if (password !== String(formData.get("repeat") ?? "")) return { error: "De to adgangskoder er ikke ens." };
  try {
    const userId = await consumeReset(token, await hashPassword(password));
    if (!userId) return { error: "Linket virker ikke længere. Bed om et nyt." };
    await createSession(userId);
  } catch (e) {
    unstable_rethrow(e);
    console.error(e);
    return { error: SAVE_FAILED };
  }
  redirect("/picks");
}
