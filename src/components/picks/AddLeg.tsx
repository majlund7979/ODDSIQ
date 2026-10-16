"use client";

import { buttonClass } from "@/components/ui";
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
      aria-pressed={inCoupon}
      className={buttonClass(inCoupon ? "primary" : "ghost", "sm")}
    >
      <span aria-hidden>{inCoupon ? "✓" : "+"}</span>
      {inCoupon ? "På kupon" : "Kupon"}
    </button>
  );
}
