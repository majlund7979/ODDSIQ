"use client";

import { saveBet } from "@/app/friends-actions";
import { PendingButton } from "@/components/forms";
import { dec } from "@/lib/format";
import { roundStake } from "@/lib/picks-advice";
import { useBankroll } from "./bankroll";

/** "Gem bet": saves the pick to the friends' league with the friend's own stake and odds. */
export function SaveBet({ eventId, category, odds, share, back, saved }: { eventId: string; category: string; odds: number | null; share: number; back: string; saved: boolean }) {
  const bankroll = useBankroll();
  return (
    <details className="group/save open:basis-full">
      <summary
        className={`ml-auto w-fit cursor-pointer list-none rounded-full border px-3.5 py-1 text-sm font-semibold ${saved ? "border-good/50 text-good" : "border-accent/30 text-accent hover:bg-lime-soft"}`}
      >
        {saved ? "✓ Gemt" : "Gem bet"}
      </summary>
      <form action={saveBet} className="mt-3 flex flex-wrap items-end gap-3 rounded-2xl bg-surface-2 p-4">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="category" value={category} />
        <input type="hidden" name="back" value={back} />
        <label className="block w-32 space-y-1 text-xs text-muted">
          Indsats (kr)
          <input name="stake" inputMode="decimal" required defaultValue={share > 0 ? roundStake(bankroll * share) : ""} placeholder={share > 0 ? undefined : "fx 50"} className="num block w-full rounded-[10px] border border-line-strong bg-surface px-2 py-1.5 text-sm text-ink" />
        </label>
        <label className="block w-32 space-y-1 text-xs text-muted">
          Odds du fik
          <input name="odds" inputMode="decimal" defaultValue={odds ? dec(odds) : ""} placeholder="fx 1,85" className="num block w-full rounded-[10px] border border-line-strong bg-surface px-2 py-1.5 text-sm text-ink" />
        </label>
        <PendingButton className="rounded-full bg-lime px-4 py-1.5 text-sm font-semibold text-accent hover:brightness-125">
          {saved ? "Opdater" : "Gem i vennerligaen"}
        </PendingButton>
        <p className="basis-full text-[11px] text-muted">Dine venner kan se det. Uden odds tæller det kun i træfprocenten.</p>
      </form>
    </details>
  );
}
