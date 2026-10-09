// "Dagens kuponforslag": the day's coupons, each with its bets, combined odds
// and the chance that every bet goes in.

import { COUPON_MIN_ODDS, ROCKET_MIN_CHANCE, type Coupon } from "@/lib/picks-extra";
import { dec } from "@/lib/format";

const COUPON_TITLE: Record<Coupon["kind"], (n: number) => string> = {
  odds: (n) => `${n} bets`,
  chance: (n) => `${n} bets`,
  rocket: (n) => `Raketten · ${n} bets`,
  goals: (n) => `Dagens over 1,5 mål · ${n} bets`,
};
const COUPON_NOTE: Record<Coupon["kind"], string> = {
  odds: `De mest sandsynlige bets med samlet odds mindst ${dec(COUPON_MIN_ODDS, 1)}`,
  chance: "Det mest sandsynlige bet i hver af dagens mest sandsynlige kampe",
  rocket: `Det mest sandsynlige bet i hver kamp, alle med mindst ${Math.round(ROCKET_MIN_CHANCE * 100)} % chance`,
  goals: "Dagens mest sandsynlige over 1,5 mål",
};

export function CouponCard({ coupons }: { coupons: Coupon[] }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl font-extrabold tracking-[-0.02em]">Dagens kuponforslag</h2>
        <span className="text-sm text-muted">Altid de mest sandsynlige bets fra vinder, over 1,5 og 2,5 mål, begge hold scorer og dobbeltchance. Alle bets på en kupon skal gå hjem</span>
      </div>
      {coupons.length === 0 ? (
        <p className="rounded-[20px] border border-line bg-surface px-5 py-6 text-sm text-ink-2">Der er ikke nok kampe i dag til en kupon. Kig forbi igen senere.</p>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2">
          {coupons.map((c) => (
            <article key={c.kind} className="flex flex-col overflow-hidden rounded-[20px] border border-accent/40 bg-lime-soft">
              <div className="flex items-end justify-between gap-3 px-5 pt-5">
                <div>
                  <div className="text-[13px] font-bold text-accent">{COUPON_TITLE[c.kind](c.picks.length)}</div>
                  <div className="text-xs text-muted">{COUPON_NOTE[c.kind]}</div>
                  <div className="num mt-2 text-[40px] font-extrabold leading-none tracking-[-0.03em]">{dec(c.odds)}</div>
                  <div className="mt-1 text-xs text-muted">samlet odds</div>
                </div>
                <div className="text-right">
                  <div className="num text-[28px] font-extrabold leading-none tracking-[-0.02em]">{Math.round(c.probability * 100)}%</div>
                  <div className="mt-1 text-xs text-muted">chance for at alle går hjem</div>
                </div>
              </div>
              <ul className="mx-3 mt-4 divide-y divide-line rounded-2xl bg-surface text-ink">
                {c.picks.map((p) => (
                  <li key={p.row.selectionId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {p.outcome}
                      </span>
                      <span className="block truncate text-xs text-muted">{p.row.match.replace(" vs ", " – ")}</span>
                    </span>
                    <span className="num shrink-0 text-sm">
                      <span className="text-ink-2">{Math.round(p.probability * 100)}%</span> · {dec(p.row.bestOdds)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="px-5 py-3.5 text-sm text-ink-2">
                100 kr giver <span className="num font-bold text-ink">{Math.round(c.odds * 100)} kr</span>, hvis alle går hjem
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
