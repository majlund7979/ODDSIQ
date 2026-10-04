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
      className={`rounded-full border px-3.5 py-1 text-sm font-semibold disabled:opacity-50 ${inCoupon ? "border-lime bg-lime text-accent" : "border-accent/30 text-accent hover:bg-lime-soft"}`}
    >
      {inCoupon ? "✓ På kupon" : "+ Kupon"}
    </button>
  );
}
