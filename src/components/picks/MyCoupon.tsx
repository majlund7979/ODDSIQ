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
  const ret = m.expectedReturn === null ? null : Math.round(m.expectedReturn * 100);
  return (
    <details className="group sticky bottom-24 z-20 ml-auto w-full max-w-md overflow-hidden rounded-full border border-line-strong bg-surface-2/95 shadow-lg backdrop-blur open:rounded-[20px] lg:bottom-4">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2 text-sm">
        <span className="num flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-bold text-white">{m.legs}</span>
        <span className="font-semibold">Din kupon</span>
        <span className="num ml-auto flex items-center gap-3 text-ink-2">
          <span title="Chance for at alle går hjem">{pct(m.probability)}</span>
          <span title={m.missingOdds ? `${m.missingOdds} bets uden odds` : "Samlet odds"}>{m.odds ? dec(m.odds) : "—"}</span>
          {ret !== null && (
            <span className={`hidden sm:inline ${ret >= 100 ? "text-good" : "text-serious"}`} title="Snit pr. 100 kr">
              {ret} kr
            </span>
          )}
        </span>
        <span className="text-muted transition-transform group-open:rotate-180" aria-hidden>
          ▴
        </span>
      </summary>
      <ul className="max-h-48 divide-y divide-line overflow-y-auto border-t border-line">
        {legs.map((l) => (
          <li key={l.key} className="flex items-center gap-3 px-4 py-1.5 text-sm">
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
      <div className="flex items-start gap-3 border-t border-line px-4 py-2 text-[11px] text-muted">
        <p className="flex-1">
          {pct(m.probability)} chance for at alle går hjem · samlet odds {m.odds ? dec(m.odds) : "—"}
          {m.missingOdds ? ` (${m.missingOdds} uden odds)` : ""}
          {ret !== null ? ` · snit ${ret} kr pr. 100 kr` : ""}. Fair samlet odds efter vores procenter: {dec(m.fairOdds)}. Skøn, ikke garantier.
        </p>
        <button type="button" onClick={clearLegs} className="shrink-0 text-xs font-medium text-ink-2 hover:text-ink">
          Ryd
        </button>
      </div>
    </details>
  );
}
