"use client";

import { saveBet } from "@/app/friends-actions";
import { fieldClass, PendingButton } from "@/components/forms";
import { buttonClass } from "@/components/ui";
import { dec } from "@/lib/format";
import { roundStake } from "@/lib/picks-advice";
import { useBankroll } from "./bankroll";

/** "Gem bet": saves the pick to the friends' league with the friend's own stake and odds. */
export function SaveBet({ eventId, category, odds, share, back, saved }: { eventId: string; category: string; odds: number | null; share: number; back: string; saved: boolean }) {
  const bankroll = useBankroll();
  return (
    <details className="group/save open:basis-full">
      <summary
        className={`ml-auto w-fit cursor-pointer list-none ${buttonClass(saved ? "secondary" : "ghost", "sm", saved ? "border-good/50 text-good hover:border-good" : "")}`}
      >
        {saved ? "✓ Gemt" : "Gem bet"}
      </summary>
      <form action={saveBet} className="rise mt-3 flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface-2 p-4">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="category" value={category} />
        <input type="hidden" name="back" value={back} />
        <label className="block w-32 text-xs font-medium text-ink-2">
          Indsats (kr)
          <input name="stake" inputMode="decimal" required defaultValue={share > 0 ? roundStake(bankroll * share) : ""} placeholder={share > 0 ? undefined : "fx 50"} className={`num ${fieldClass}`} />
        </label>
        <label className="block w-32 text-xs font-medium text-ink-2">
          Odds du fik
          <input name="odds" inputMode="decimal" defaultValue={odds ? dec(odds) : ""} placeholder="fx 1,85" className={`num ${fieldClass}`} />
        </label>
        <PendingButton className={buttonClass("primary", "lg")}>
          {saved ? "Opdater" : "Gem i vennerligaen"}
        </PendingButton>
        <p className="basis-full text-xs text-ink-2">Dine venner kan se det. Uden odds tæller det kun i træfprocenten.</p>
      </form>
    </details>
  );
}
