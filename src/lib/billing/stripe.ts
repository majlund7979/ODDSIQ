// Minimal Stripe REST client (fetch, no SDK) and webhook signature check.
// Docs: https://docs.stripe.com/api and https://docs.stripe.com/webhooks#verify-manually

import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.stripe.com/v1";

function form(params: Record<string, string | undefined>): string {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) body.append(k, v);
  return body.toString();
}

async function stripePost<T>(path: string, params: Record<string, string | undefined>): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form(params),
  });
  const json = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok) throw new Error(`Stripe ${path} failed: ${json.error?.message ?? res.status}`);
  return json;
}

export async function createCheckoutSession(opts: { userId: string; email: string; customerId: string | null; appUrl: string }): Promise<string> {
  const s = await stripePost<{ url: string }>("/checkout/sessions", {
    mode: "subscription",
    "line_items[0][price]": process.env.STRIPE_PRICE_PRO,
    "line_items[0][quantity]": "1",
    client_reference_id: opts.userId,
    customer: opts.customerId ?? undefined,
    customer_email: opts.customerId ? undefined : opts.email,
    "subscription_data[metadata][userId]": opts.userId,
    success_url: `${opts.appUrl}/account?billing=success`,
    cancel_url: `${opts.appUrl}/account?billing=cancelled`,
  });
  return s.url;
}

export async function createPortalSession(customerId: string, appUrl: string): Promise<string> {
  const s = await stripePost<{ url: string }>("/billing_portal/sessions", { customer: customerId, return_url: `${appUrl}/account` });
  return s.url;
}

export const SIGNATURE_TOLERANCE_S = 300;

/** Verifies a Stripe-Signature header against the raw body. */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, nowS = Math.floor(Date.now() / 1000)): boolean {
  if (!header) return false;
  const parts = header.split(",").map((p) => p.split("=") as [string, string]);
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!Number.isFinite(t) || !sigs.length || Math.abs(nowS - t) > SIGNATURE_TOLERANCE_S) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  return sigs.some((s) => {
    const got = Buffer.from(s, "hex");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

export interface PlanUpdate {
  userId?: string;
  customerId: string;
  plan: "free" | "pro";
  status: string;
  renewsAt: Date | null;
}

/** Maps the webhook events ODDSIQ listens to onto a plan change. Others return null. */
export function planUpdateFromEvent(event: { type: string; data: { object: Record<string, unknown> } }, activeStatuses: Set<string>): PlanUpdate | null {
  const o = event.data.object;
  if (event.type === "checkout.session.completed" && o.mode === "subscription" && typeof o.customer === "string") {
    return { userId: typeof o.client_reference_id === "string" ? o.client_reference_id : undefined, customerId: o.customer, plan: "pro", status: "active", renewsAt: null };
  }
  if ((event.type === "customer.subscription.updated" || event.type === "customer.subscription.created" || event.type === "customer.subscription.deleted") && typeof o.customer === "string") {
    const status = event.type === "customer.subscription.deleted" ? "canceled" : String(o.status);
    const meta = o.metadata as Record<string, string> | undefined;
    // Newer API versions carry the period end on the subscription item.
    const item = (o.items as { data?: { current_period_end?: number }[] } | undefined)?.data?.[0];
    const endS = typeof o.current_period_end === "number" ? o.current_period_end : item?.current_period_end;
    const end = typeof endS === "number" ? new Date(endS * 1000) : null;
    return { userId: meta?.userId, customerId: o.customer, plan: activeStatuses.has(status) ? "pro" : "free", status, renewsAt: end };
  }
  return null;
}
