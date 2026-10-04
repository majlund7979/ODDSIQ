"use client";

import { toggleLeg, useLegs, MAX_LEGS, type Leg } from "./coupon-store";

/** "+ Kupon": adds the bet to the visitor's own coupon. */
export function AddLeg({ leg }: { leg: Leg }) {
  const legs = useLegs();
  const inCoupon = legs.some((l) => l.key === leg.key);
  const full = !inCoupon && legs.filter((l) => l.eventId !== leg.eventId).length >= MAX_LEGS;
  return (
    <button
      type="button"
      onClick={() => toggleLeg(leg)}
      disabled={full}
      title={full ? `Højst ${MAX_LEGS} bets på en kupon` : inCoupon ? "Fjern fra din kupon" : "Læg på din kupon"}
      className={`rounded-md border px-3 py-1 text-sm disabled:opacity-50 ${inCoupon ? "border-accent/60 bg-accent/10 text-accent" : "border-line-strong text-ink-2 hover:text-ink"}`}
    >
      {inCoupon ? "✓ På kupon" : "+ Kupon"}
    </button>
  );
}
