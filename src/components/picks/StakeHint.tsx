"use client";

import { roundStake } from "@/lib/picks-advice";
import { useBankroll } from "./bankroll";

/** The suggested stake in kroner for this browser's bankroll. */
export function StakeHint({ share, note, reason }: { share: number; note: string; reason: string }) {
  const bankroll = useBankroll();
  return (
    <span className="flex items-baseline gap-1.5 text-sm" title={reason}>
      <span className="text-ink-2">Forslag:</span>
      <span className="num font-semibold">{roundStake(bankroll * share)} kr</span>
      <span className="hidden text-xs text-muted sm:inline">({note})</span>
    </span>
  );
}
