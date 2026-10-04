"use client";

// "Din kupon": the bets the visitor picked, with combined chance and odds.
// Sticks to the bottom of the screen while it has bets in it.

import { couponMath } from "@/lib/my-coupon";
import { clearLegs, removeLeg, useLegs } from "./coupon-store";

const dec = (x: number) => x.toFixed(2).replace(".", ",");
const pct = (x: number) => `${Math.round(x * 100)} %`;

export function MyCoupon() {
  const legs = useLegs();
  const m = couponMath(legs);
  if (!m) return null;
  return (
    <section className="sticky bottom-20 z-20 overflow-hidden rounded-2xl border border-accent/40 bg-surface shadow-lg lg:bottom-4">
      <div className="flex items-center justify-between border-b border-line px-5 py-2.5">
        <span className="text-sm font-semibold">
          Din kupon · {m.legs} {m.legs === 1 ? "bet" : "bets"}
        </span>
        <button type="button" onClick={clearLegs} className="text-xs text-muted hover:text-ink">
          Ryd
        </button>
      </div>
      <ul className="max-h-40 divide-y divide-line overflow-y-auto">
        {legs.map((l) => (
          <li key={l.key} className="flex items-center gap-3 px-5 py-1.5 text-sm">
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium">{l.outcome}</span> <span className="text-xs text-muted">{l.match.replace(" vs ", " – ")}</span>
            </span>
            <span className="num shrink-0 text-xs text-ink-2">
              {pct(l.probability)}
              {l.odds ? ` · ${dec(l.odds)}` : ""}
            </span>
            <button type="button" onClick={() => removeLeg(l.key)} aria-label={`Fjern ${l.outcome}`} className="text-muted hover:text-critical">
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-3 gap-2 border-t border-line px-5 py-2.5 text-center">
        <div>
          <div className="num text-lg font-semibold">{pct(m.probability)}</div>
          <div className="text-[11px] text-muted">chance for alle</div>
        </div>
        <div>
          <div className="num text-lg font-semibold">{m.odds ? dec(m.odds) : "—"}</div>
          <div className="text-[11px] text-muted">samlet odds{m.missingOdds ? ` (${m.missingOdds} uden)` : ""}</div>
        </div>
        <div>
          <div className={`num text-lg font-semibold ${m.expectedReturn === null ? "" : m.expectedReturn >= 1 ? "text-good" : "text-serious"}`}>
            {m.expectedReturn === null ? "—" : `${Math.round(m.expectedReturn * 100)} kr`}
          </div>
          <div className="text-[11px] text-muted">snit pr. 100 kr</div>
        </div>
      </div>
      <p className="border-t border-line px-5 py-2 text-[11px] text-muted">
        Fair samlet odds efter vores procenter: {dec(m.fairOdds)}. Chancen ganger bettene sammen, fordi de er på forskellige kampe. Over 100 kr i snit betyder værdi. Skøn, ikke garantier.
      </p>
    </section>
  );
}
