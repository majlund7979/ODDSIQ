"use client";

import { roundStake } from "@/lib/picks-advice";
import { useBankroll } from "./bankroll";

/** The suggested stake in kroner for this browser's bankroll. */
export function StakeHint({ share, note, reason }: { share: number; note: string; reason: string }) {
  const bankroll = useBankroll();
  return (
    <span className="flex flex-wrap items-baseline gap-x-1.5 text-sm" title={reason}>
      <span className="text-ink-2">Forslag:</span>
      <span className="num font-semibold">{share > 0 ? `${roundStake(bankroll * share)} kr` : "spil ikke"}</span>
      <span className="text-xs text-muted">({note})</span>
    </span>
  );
}
