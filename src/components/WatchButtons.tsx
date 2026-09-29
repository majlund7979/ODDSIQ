import { toggleWatch, trackPosition } from "@/app/actions";
import type { WatchItem, WatchKind } from "@/lib/demo/personal";

const btn = "rounded border px-2 py-0.5 text-[11px] transition-colors";

/** Server-rendered toggle; works without JavaScript and re-renders the page after the cookie changes. */
export function WatchToggle({ kind, id, label, watchlist }: { kind: WatchKind; id: string; label: string; watchlist: WatchItem[] }) {
  const on = watchlist.some((w) => w.kind === kind && w.id === id);
  return (
    <form action={toggleWatch}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <button type="submit" aria-pressed={on} className={`${btn} ${on ? "border-accent/60 text-accent" : "border-line-strong text-ink-2 hover:text-ink"}`}>
        {on ? "★" : "☆"} {label}
      </button>
    </form>
  );
}

export function TrackPriceButton({ selectionId, odds }: { selectionId: string; odds: string }) {
  return (
    <form action={trackPosition}>
      <input type="hidden" name="selectionId" value={selectionId} />
      <button type="submit" className={`${btn} border-line-strong text-ink-2 hover:text-ink`} title="Adds this price to My Bets so you can follow its CLV and result. No bet is placed.">
        + Track price {odds}
      </button>
    </form>
  );
}
