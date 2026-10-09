// Plans shown on the account page. The Pro price comes from the environment so
// it can be set at launch without a code change.

export interface Plan {
  id: "free" | "pro";
  name: string;
  priceLabel: string;
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    priceLabel: "€0",
  },
  {
    id: "pro",
    name: "Pro",
    priceLabel: process.env.PRO_PRICE_LABEL || "Pris kommer",
  },
];

/** Billing is live only when Stripe is configured. */
export const BILLING_ENABLED = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_PRO);

/** Subscription statuses that keep Pro access. */
export const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);
