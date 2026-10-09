"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { isInvited, isOwner, normaliseEmail, requireOwner } from "@/lib/auth/friends";
import { allowAttempt, hashPassword, validateCredentials, verifyPassword } from "@/lib/auth/password";
import { safeNext } from "@/lib/auth/redirect";
import { validEmail } from "@/lib/auth/rules";
import { ACCOUNTS_ENABLED, createSession, currentUser, destroySession, newUserId } from "@/lib/auth/session";
import { BILLING_ENABLED } from "@/lib/billing/plans";
import { createCheckoutSession, createPortalSession } from "@/lib/billing/stripe";
import { db } from "@/lib/db";
import { SAVE_FAILED, SIGN_IN_FAILED } from "@/lib/save-failed";
import { siteOrigin } from "@/lib/site-url";

export interface AuthState {
  error?: string;
  /** Echoed back so a failed attempt keeps the email field filled in. */
  email?: string;
}

const GENERIC = "Forkert email eller adgangskode.";
const OFF = "Login er ikke slået til endnu.";
const NOT_INVITED = "Den email er ikke inviteret. Bed den, der har sendt dig linket, om at tilføje dig.";
const TOO_MANY = "For mange forsøg. Prøv igen om 15 minutter.";

async function clientKey(email: string) {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  return [`ip:${ip}`, `email:${email}`];
}

export async function signUp(_: AuthState, formData: FormData): Promise<AuthState> {
  if (!ACCOUNTS_ENABLED) return { error: OFF };
  const email = normaliseEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const invalid = validateCredentials(email, password);
  if (invalid) return { email, error: invalid };
  if (!(await clientKey(email)).every((k) => allowAttempt(k))) return { email, error: TOO_MANY };
  try {
    if (!(await isInvited(email))) return { email, error: NOT_INVITED };
    if (await db().user.findUnique({ where: { email } })) return { email, error: "Der findes allerede en konto med den email. Log ind i stedet." };
    const id = newUserId();
    try {
      await db().user.create({ data: { id, email, passwordHash: await hashPassword(password) } });
    } catch {
      return { email, error: "Der findes allerede en konto med den email. Log ind i stedet." };
    }
    await createSession(id);
  } catch (e) {
    unstable_rethrow(e);
    console.error(e);
    return { email, error: SAVE_FAILED };
  }
  redirect(safeNext(formData.get("next")));
}

export async function signIn(_: AuthState, formData: FormData): Promise<AuthState> {
  if (!ACCOUNTS_ENABLED) return { error: OFF };
  const email = normaliseEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  if (!(await clientKey(email)).every((k) => allowAttempt(k))) return { email, error: TOO_MANY };
  try {
    const user = await db().user.findUnique({ where: { email } });
    // Hash anyway when the user is missing, so response time does not reveal which emails exist.
    const ok = user ? await verifyPassword(password, user.passwordHash) : (await hashPassword(password), false);
    if (!user || !ok) return { email, error: GENERIC };
    if (!(await isInvited(email))) return { email, error: NOT_INVITED };
    await createSession(user.id);
  } catch (e) {
    unstable_rethrow(e);
    console.error(e);
    return { email, error: SIGN_IN_FAILED };
  }
  redirect(safeNext(formData.get("next")));
}

export async function signOut(): Promise<void> {
  await destroySession();
  redirect("/login");
}

export async function startCheckout(): Promise<void> {
  const user = await currentUser();
  if (!user) redirect("/login?next=/account");
  if (!BILLING_ENABLED) redirect("/account?billing=unavailable");
  const url = await createCheckoutSession({ userId: user.id, email: user.email, customerId: user.stripeCustomerId, appUrl: await siteOrigin() });
  redirect(url);
}

export async function openBillingPortal(): Promise<void> {
  const user = await currentUser();
  if (!user) redirect("/login?next=/account");
  if (!BILLING_ENABLED || !user.stripeCustomerId) redirect("/account?billing=unavailable");
  redirect(await createPortalSession(user.stripeCustomerId, await siteOrigin()));
}

export interface FriendState {
  error?: string;
  ok?: string;
}

/** Owner only: invite a friend by email. */
export async function addFriend(_: FriendState, formData: FormData): Promise<FriendState> {
  try {
    await requireOwner();
    const email = normaliseEmail(String(formData.get("email") ?? ""));
    const name = String(formData.get("name") ?? "").trim().slice(0, 60);
    if (!validEmail(email)) return { error: "Skriv en gyldig email." };
    if (isOwner(email)) return { error: "Det er din egen email. Du har altid adgang." };
    await db().friend.upsert({ where: { email }, create: { email, name }, update: { name } });
    revalidatePath("/venner");
    return { ok: `${name || email} er inviteret.` };
  } catch (e) {
    unstable_rethrow(e);
    console.error(e);
    return { error: SAVE_FAILED };
  }
}

/** Owner only: take a friend's access away. Their sessions end at once. */
export async function removeFriend(formData: FormData): Promise<void> {
  await requireOwner();
  const email = normaliseEmail(String(formData.get("email") ?? ""));
  await db().friend.deleteMany({ where: { email } });
  await db().session.deleteMany({ where: { user: { email } } });
  revalidatePath("/venner");
}
