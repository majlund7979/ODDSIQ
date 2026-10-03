"use client";

import { saveBet } from "@/app/friends-actions";
import { roundStake } from "@/lib/picks-advice";
import { useBankroll } from "./bankroll";

const dec = (x: number) => x.toFixed(2).replace(".", ",");

/** "Gem bet": saves the pick to the friends' league with the friend's own stake and odds. */
export function SaveBet({ eventId, category, odds, share, back, saved }: { eventId: string; category: string; odds: number | null; share: number; back: string; saved: boolean }) {
  const bankroll = useBankroll();
  return (
    <details className="group/save open:basis-full">
      <summary
        className={`ml-auto w-fit cursor-pointer list-none rounded-md border px-3 py-1 text-sm ${saved ? "border-good/50 text-good" : "border-line-strong text-ink-2 hover:text-ink"}`}
      >
        {saved ? "✓ Gemt" : "Gem bet"}
      </summary>
      <form action={saveBet} className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-line-strong bg-surface-2 p-4">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="category" value={category} />
        <input type="hidden" name="back" value={back} />
        <label className="block w-32 space-y-1 text-xs text-muted">
          Indsats (kr)
          <input name="stake" inputMode="decimal" required defaultValue={roundStake(bankroll * share)} className="num block w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink" />
        </label>
        <label className="block w-32 space-y-1 text-xs text-muted">
          Odds du fik
          <input name="odds" inputMode="decimal" defaultValue={odds ? dec(odds) : ""} placeholder="fx 1,85" className="num block w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink" />
        </label>
        <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-page">
          {saved ? "Opdater" : "Gem i vennerligaen"}
        </button>
        <p className="basis-full text-[11px] text-muted">Dine venner kan se det. Uden odds tæller det kun i træfprocenten.</p>
      </form>
    </details>
  );
}
