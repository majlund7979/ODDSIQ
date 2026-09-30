// Plans shown on the landing page and the account page. Prices come from the
// environment so they can be set at launch without a code change.

export interface Plan {
  id: "free" | "pro";
  name: string;
  priceLabel: string;
  summary: string;
  features: string[];
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    priceLabel: "€0",
    summary: "The full terminal on demo data, and the public prediction ledger.",
    features: ["Market Terminal, Value Scanner and Live Markets", "Model Lab, Performance and CLV", "Full prediction ledger with CSV export", "Watchlist and My Bets"],
  },
  {
    id: "pro",
    name: "Pro",
    priceLabel: process.env.PRO_PRICE_LABEL || "Price set at launch",
    summary: "Live bookmaker prices once the data feed is connected, synced across your devices.",
    features: ["Live odds from the connected feed", "Alerts, AI Analyst and the weekly model report", "Watchlist and tracked prices saved to your account", "Priority on new leagues and markets"],
  },
];

/** Billing is live only when Stripe is configured. */
export const BILLING_ENABLED = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_PRO);

/** Subscription statuses that keep Pro access. */
export const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);
