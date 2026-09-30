"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { allowAttempt, hashPassword, validateCredentials, verifyPassword } from "@/lib/auth/password";
import { safeNext } from "@/lib/auth/redirect";
import { ACCOUNTS_ENABLED, createSession, currentUser, destroySession, newUserId } from "@/lib/auth/session";
import { BILLING_ENABLED } from "@/lib/billing/plans";
import { createCheckoutSession, createPortalSession } from "@/lib/billing/stripe";
import { db } from "@/lib/db";
import { decodePositions, decodeWatchlist, encodePositions, encodeWatchlist, MAX_POSITIONS } from "@/lib/demo/personal";
import { POSITIONS_COOKIE, THRESHOLD_COOKIE, WATCH_COOKIE } from "@/lib/personal-store";

export interface AuthState {
  error?: string;
  /** Echoed back so a failed attempt keeps the email field filled in. */
  email?: string;
}

const GENERIC = "Email or password is not correct.";

async function clientKey(email: string) {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  return [`ip:${ip}`, `email:${email}`];
}

/** Moves signed-out cookie lists onto the account, then clears the cookies. */
async function adoptCookieState(userId: string) {
  const store = await cookies();
  const user = await db().user.findUniqueOrThrow({ where: { id: userId } });
  const watch = [...decodeWatchlist(user.watchlist)];
  for (const i of decodeWatchlist(store.get(WATCH_COOKIE)?.value)) if (!watch.some((w) => w.kind === i.kind && w.id === i.id)) watch.push(i);
  const positions = [...decodePositions(user.positions), ...decodePositions(store.get(POSITIONS_COOKIE)?.value)].slice(-MAX_POSITIONS);
  await db().user.update({ where: { id: userId }, data: { watchlist: encodeWatchlist(watch), positions: encodePositions(positions) } });
  for (const c of [WATCH_COOKIE, POSITIONS_COOKIE, THRESHOLD_COOKIE]) store.delete(c);
}

export async function signUp(_: AuthState, formData: FormData): Promise<AuthState> {
  if (!ACCOUNTS_ENABLED) return { error: "Accounts are not switched on yet." };
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const invalid = validateCredentials(email, password);
  if (invalid) return { email, error: invalid };
  if (!(await clientKey(email)).every((k) => allowAttempt(k))) return { email, error: "Too many attempts. Try again in 15 minutes." };
  if (await db().user.findUnique({ where: { email } })) return { email, error: "An account with that email already exists. Sign in instead." };
  const id = newUserId();
  try {
    await db().user.create({ data: { id, email, passwordHash: await hashPassword(password) } });
  } catch {
    return { email, error: "An account with that email already exists. Sign in instead." };
  }
  await createSession(id);
  await adoptCookieState(id);
  redirect(safeNext(formData.get("next")));
}

export async function signIn(_: AuthState, formData: FormData): Promise<AuthState> {
  if (!ACCOUNTS_ENABLED) return { error: "Accounts are not switched on yet." };
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!(await clientKey(email)).every((k) => allowAttempt(k))) return { email, error: "Too many attempts. Try again in 15 minutes." };
  const user = await db().user.findUnique({ where: { email } });
  // Hash anyway when the user is missing, so response time does not reveal which emails exist.
  const ok = user ? await verifyPassword(password, user.passwordHash) : (await hashPassword(password), false);
  if (!user || !ok) return { email, error: GENERIC };
  await createSession(user.id);
  await adoptCookieState(user.id);
  redirect(safeNext(formData.get("next")));
}

export async function signOut(): Promise<void> {
  await destroySession();
  redirect("/");
}

function appUrl(h: Headers): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

export async function startCheckout(): Promise<void> {
  const user = await currentUser();
  if (!user) redirect("/login?next=/account");
  if (!BILLING_ENABLED) redirect("/account?billing=unavailable");
  const url = await createCheckoutSession({ userId: user.id, email: user.email, customerId: user.stripeCustomerId, appUrl: appUrl(await headers()) });
  redirect(url);
}

export async function openBillingPortal(): Promise<void> {
  const user = await currentUser();
  if (!user) redirect("/login?next=/account");
  if (!BILLING_ENABLED || !user.stripeCustomerId) redirect("/account?billing=unavailable");
  redirect(await createPortalSession(user.stripeCustomerId, appUrl(await headers())));
}
