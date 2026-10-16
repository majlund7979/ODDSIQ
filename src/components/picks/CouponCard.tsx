// "Dagens kuponforslag": the day's coupons, each with its bets, combined odds
// and the chance that every bet goes in.

import { COUPON_LEG_MIN_ODDS, COUPON_MIN_ODDS, ROCKET_MIN_CHANCE, type Coupon } from "@/lib/picks-extra";
import { dec } from "@/lib/format";
import { EmptyState } from "@/components/ui";

const COUPON_TITLE: Record<Coupon["kind"], (n: number) => string> = {
  odds: (n) => `Samlet odds mindst ${dec(COUPON_MIN_ODDS, 1)} · ${n} bets`,
  chance: (n) => `Sandsynligste kampe · ${n} bets`,
  rocket: (n) => `Raketten · ${n} bets`,
  goals: (n) => `Dagens over 1,5 mål · ${n} bets`,
};
const COUPON_NOTE: Record<Coupon["kind"], string> = {
  odds: `De mest sandsynlige bets med samlet odds mindst ${dec(COUPON_MIN_ODDS, 1)}`,
  chance: "Det mest sandsynlige bet i hver af dagens mest sandsynlige kampe",
  rocket: `Det mest sandsynlige bet i hver kamp, alle med mindst ${Math.round(ROCKET_MIN_CHANCE * 100)} % chance`,
  goals: "Dagens mest sandsynlige over 1,5 mål",
};

const KIND_LABEL: Record<Coupon["kind"], string> = { odds: "Odds", chance: "Chance", rocket: "Raketten", goals: "Mål" };

/** The chance that every bet goes in, as a ring: a figure you can read at a glance without a second big number. */
function ChanceRing({ p }: { p: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-[60px] w-[60px] shrink-0" role="img" aria-label={`${Math.round(p * 100)} % chance for at alle går hjem`}>
      <svg viewBox="0 0 52 52" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="26" cy="26" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="4" />
        <circle cx="26" cy="26" r={r} fill="none" stroke="var(--text)" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} className="coupon-ring" />
      </svg>
      <span className="figure absolute inset-0 flex items-center justify-center text-base">{Math.round(p * 100)}%</span>
    </div>
  );
}

export function CouponCard({ coupons, lead }: { coupons: Coupon[]; lead?: React.ReactNode }) {
  return (
    <section className="space-y-4" aria-labelledby="kuponer">
      <div className="space-y-2">
        <h2 id="kuponer" className="display text-[34px] sm:text-[40px]">
          Dagens kuponforslag
        </h2>
        <p className="max-w-[72ch] text-sm leading-relaxed text-ink-2">
          De mest sandsynlige bets fra vinder, over 1,5 og 2,5 mål, begge hold scorer og dobbeltchance. Hvert bet har mindst odds{" "}
          <span className="num font-semibold text-ink">{dec(COUPON_LEG_MIN_ODDS)}</span>, og alle bets på en kupon skal gå hjem.
        </p>
        {lead}
      </div>
      {coupons.length === 0 ? (
        <EmptyState title="Ingen kupon i dag" text="Der er ikke nok kampe i dag til en kupon. Kig forbi igen senere." />
      ) : (
        <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
          {coupons.map((c, i) => (
            <article
              key={c.kind}
              style={{ ["--i" as string]: i }}
              className={`rise group relative flex flex-col rounded-card border border-line-strong bg-surface transition-[border-color,translate,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-[var(--shadow-pop)] ${
                coupons.length % 2 === 1 && i === coupons.length - 1 ? "md:col-span-2 xl:col-span-1" : ""
              }`}
            >
              <header className="px-5 pt-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="eyebrow text-accent">{KIND_LABEL[c.kind]}</span>
                  <span className="text-xs text-ink-2">{c.picks.length} bets</span>
                </div>
                <h3 className="mt-1.5 text-md font-semibold leading-snug text-ink">{COUPON_TITLE[c.kind](c.picks.length).replace(/ · \d+ bets$/, "")}</h3>
                <p className="mt-0.5 text-xs leading-snug text-ink-2">{COUPON_NOTE[c.kind]}</p>
                <div className="mt-5 flex items-end justify-between gap-3">
                  <div>
                    <div className="figure text-[56px] text-ink">{dec(c.odds)}</div>
                    <div className="eyebrow mt-1.5">samlet odds</div>
                  </div>
                  <div className="flex flex-col items-center gap-1.5">
                    <ChanceRing p={c.probability} />
                    <span className="max-w-[9ch] text-center text-xs leading-tight text-ink-2">chance for alle</span>
                  </div>
                </div>
              </header>
              <ol className="mt-5 flex-1 divide-y divide-line border-t border-line">
                {c.picks.map((p, k) => (
                  <li key={p.row.selectionId} className="flex items-center gap-3 px-5 py-3">
                    <span className="figure w-4 shrink-0 text-sm text-muted">{k + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{p.outcome}</span>
                      <span className="block truncate text-xs text-ink-2">{p.row.match.replace(" vs ", " – ")}</span>
                    </span>
                    <span className="num shrink-0 text-right">
                      <span className="block text-sm font-semibold">{dec(p.row.bestOdds)}</span>
                      <span className="block text-xs text-ink-2">{Math.round(p.probability * 100)}&nbsp;%</span>
                    </span>
                  </li>
                ))}
              </ol>
              {/* The tear-off line of a betting slip. */}
              <div aria-hidden className="relative h-0 border-t border-dashed border-line-strong">
                <span className="absolute -top-2 -left-2 h-4 w-4 rounded-full border border-line-strong bg-page [clip-path:inset(0_0_0_50%)]" />
                <span className="absolute -top-2 -right-2 h-4 w-4 rounded-full border border-line-strong bg-page [clip-path:inset(0_50%_0_0)]" />
              </div>
              <footer className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-5 py-4 text-sm text-ink-2">
                <span className="whitespace-nowrap">
                  100 kr giver <span className="figure text-xl text-ink">{Math.round(c.odds * 100)} kr</span>
                </span>
                <span className="whitespace-nowrap text-xs">hvis alle går hjem</span>
              </footer>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
