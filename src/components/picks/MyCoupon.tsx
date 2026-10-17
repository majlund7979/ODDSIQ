"use client";

// "Din kupon": the bets the visitor picked, with combined chance and odds.
// Sticks to the bottom of the screen while it has bets in it.

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { checkCoupon, playCoupon, type PlayState } from "@/app/friends-actions";
import { dec, pct } from "@/lib/format";
import { couponMath, type LegCheck } from "@/lib/my-coupon";
import { buttonClass } from "@/components/ui";
import { fieldClass } from "@/components/forms";
import { clearLegs, removeLeg, removeLegs, updateLegOdds, useLegs, type Leg } from "./coupon-store";

const legsJson = (legs: Leg[]) => JSON.stringify(legs.map((l) => ({ key: l.key, eventId: l.eventId, category: l.category, outcome: l.outcome, odds: l.odds })));

/** `canPlay`: signed in, so "Spil kupon" can save it to the friends' league. */
export function MyCoupon({ canPlay = false }: { canPlay?: boolean }) {
  const legs = useLegs();
  const m = couponMath(legs);
  // Per leg: closed, now another outcome, or new odds. Filled when the coupon is shown and when "Spil kupon" is refused.
  const [checks, setChecks] = useState<Record<string, LegCheck>>({});
  const apply = (list: LegCheck[]) => {
    setChecks((old) => ({ ...old, ...Object.fromEntries(list.map((c) => [c.key, c])) }));
    updateLegOdds(list.filter((c) => c.status === "odds").map((c) => ({ key: c.key, odds: c.odds ?? null })));
  };
  const [state, play, pending] = useActionState<PlayState, FormData>(async (prev, formData) => {
    const next = await playCoupon(prev, formData);
    if (next.checks) apply(next.checks);
    return next;
  }, {});
  useEffect(() => {
    if (state.ok) clearLegs();
  }, [state]);
  const legKeys = legs.map((l) => l.key).join(",");
  useEffect(() => {
    if (!canPlay || !legKeys) return;
    let live = true;
    checkCoupon(legsJson(legs)).then((list) => live && apply(list));
    return () => {
      live = false;
    };
    // Only when legs are added or removed; new odds alone do not need another look.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPlay, legKeys]);
  if (!m) {
    if (!state.ok) return null;
    return (
      <div role="status" className="rise sticky bottom-24 z-20 ml-auto flex w-full max-w-md items-center gap-3 rounded-card border border-good/40 bg-surface-2/95 px-4 py-3 text-sm shadow-[var(--shadow-pop)] backdrop-blur-xl xl:bottom-4">
        <span className="text-good">✓</span>
        <span className="min-w-0 flex-1 truncate">Kuponen er spillet</span>
        <Link href="/picks/liga" className="shrink-0 font-semibold text-accent hover:underline">
          Se dine bets
        </Link>
      </div>
    );
  }
  const ret = m.expectedReturn === null ? null : Math.round(m.expectedReturn * 100);
  const isClosed = (l: Leg) => checks[l.key]?.status === "closed" || checks[l.key]?.status === "changed";
  const closed = legs.filter(isClosed);
  // The refusal stays only while a bet it named is still on the coupon.
  const showError = state.error && (!state.checks || state.checks.some((c) => c.status !== "ok" && legs.some((l) => l.key === c.key)));
  const clear = () => {
    if (!window.confirm("Ryd hele kuponen?")) return;
    clearLegs();
  };
  return (
    <details className="rise group sticky bottom-24 z-20 ml-auto w-full max-w-md overflow-hidden rounded-card border border-accent/40 bg-surface-2/95 shadow-[var(--shadow-pop)] backdrop-blur-xl xl:bottom-4">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-2 text-sm">
        <span className="num flex h-7 min-w-7 items-center justify-center rounded-full bg-accent px-1.5 text-sm font-bold text-on-accent">{m.legs}</span>
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
        {legs.map((l) => {
          const c = checks[l.key];
          const gone = isClosed(l);
          const newOdds = !gone && l.prevOdds !== undefined && l.prevOdds !== l.odds;
          return (
            <li key={l.key} className={`flex items-center gap-3 px-4 py-1.5 text-sm ${gone ? "bg-critical/10" : ""}`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate">
                  <span className={`font-medium ${gone ? "text-muted line-through" : ""}`}>{l.outcome}</span> <span className="text-xs text-muted">{l.match.replace(" vs ", " – ")}</span>
                </span>
                {gone && (
                  <span className="block text-xs font-semibold text-critical">
                    Lukket{c?.status === "changed" && c.outcome ? ` · vores bud er nu ${c.outcome}` : " · kan ikke spilles længere"}
                  </span>
                )}
                {newOdds && (
                  <span className="block text-xs font-semibold text-warning">
                    Ny odds{l.prevOdds ? `: før ${dec(l.prevOdds)}` : ""}
                  </span>
                )}
              </span>
              <span className="num shrink-0 text-xs text-ink-2">
                {pct(l.probability)}
                {l.odds ? ` · ${dec(l.odds)}` : ""}
              </span>
              <button type="button" onClick={() => removeLeg(l.key)} aria-label={`Fjern ${l.outcome}`} className="-my-2 -mr-2 flex h-10 w-10 shrink-0 items-center justify-center text-muted hover:text-critical">
                ×
              </button>
            </li>
          );
        })}
      </ul>
      {canPlay && m.legs >= 2 && (
        <form action={play} className="flex flex-wrap items-end gap-2 border-t border-line px-4 py-2.5">
          <input type="hidden" name="legs" value={legsJson(legs)} />
          <label className="w-28 text-xs font-medium text-ink-2">
            Indsats (kr)
            <input name="stake" inputMode="decimal" required placeholder="fx 50" className={`num ${fieldClass}`} />
          </label>
          <label className="w-28 text-xs font-medium text-ink-2">
            Samlet odds
            <input name="odds" inputMode="decimal" key={m.odds ?? 0} defaultValue={m.odds && !m.missingOdds ? dec(m.odds) : ""} placeholder="fx 3,40" className={`num ${fieldClass}`} />
          </label>
          {closed.length > 0 && (
            <button type="button" onClick={() => removeLegs(closed.map((l) => l.key))} className={buttonClass("ghost", "lg", "ml-auto")}>
              Fjern {closed.length === 1 ? "det lukkede bet" : `${closed.length} lukkede bets`}
            </button>
          )}
          <button type="submit" disabled={pending || closed.length > 0} aria-busy={pending || undefined} className={buttonClass("primary", "lg", closed.length ? "" : "ml-auto")}>
            {pending ? "Gemmer…" : "Spil kupon"}
          </button>
          {showError && <p role="alert" className="basis-full text-xs text-critical">{state.error}</p>}
          <p className="basis-full text-xs text-ink-2">Gemmes som ét bet under Vennernes bets, så dine venner kan se den. Den går kun hjem, hvis alle bets gør. Vi placerer ikke spillet hos en bookmaker.</p>
        </form>
      )}
      {canPlay && m.legs < 2 && <p className="border-t border-line px-4 py-2 text-xs text-muted">Læg mindst 2 bets på for at spille kuponen.</p>}
      <div className="flex items-start gap-3 border-t border-line px-4 py-2.5 text-xs text-ink-2">
        <p className="flex-1">
          {pct(m.probability)} chance for at alle går hjem · samlet odds {m.odds ? dec(m.odds) : "—"}
          {m.missingOdds ? ` (${m.missingOdds} uden odds)` : ""}
          {ret !== null ? ` · snit ${ret} kr pr. 100 kr` : ""}. Fair samlet odds efter vores procenter: {dec(m.fairOdds)}. Skøn, ikke garantier.
        </p>
        <button type="button" onClick={clear} className="-my-2 -mr-2 min-h-11 shrink-0 rounded-field px-3 text-sm font-medium text-ink-2 hover:bg-surface-3 hover:text-ink">
          Ryd
        </button>
      </div>
    </details>
  );
}
