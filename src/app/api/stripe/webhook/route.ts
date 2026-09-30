// Stripe webhook: keeps each user's plan in sync with their subscription.
// Configure in Stripe with the events checkout.session.completed and
// customer.subscription.created/updated/deleted.

import { ACTIVE_STATUSES } from "@/lib/billing/plans";
import { planUpdateFromEvent, verifyStripeSignature } from "@/lib/billing/stripe";
import { db, DATABASE_CONFIGURED } from "@/lib/db";

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !DATABASE_CONFIGURED) return new Response("Billing is not configured.", { status: 503 });
  const raw = await req.text();
  if (!verifyStripeSignature(raw, req.headers.get("stripe-signature"), secret)) return new Response("Invalid signature.", { status: 400 });

  const event = JSON.parse(raw);
  const update = planUpdateFromEvent(event, ACTIVE_STATUSES);
  if (!update) return Response.json({ received: true, ignored: event.type });

  const where = update.userId ? { id: update.userId } : { stripeCustomerId: update.customerId };
  const result = await db().user.updateMany({
    where,
    data: { stripeCustomerId: update.customerId, plan: update.plan, planStatus: update.status, ...(update.renewsAt ? { planRenewsAt: update.renewsAt } : {}) },
  });
  return Response.json({ received: true, updated: result.count });
}
