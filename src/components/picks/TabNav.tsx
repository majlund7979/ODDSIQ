// The bet-type menu beside the list, with each type's hit rate, the Top 5/10
// switch, the bankroll and how the stake is worked out.

import Link from "next/link";
import type { Metric } from "@/lib/metrics/metric";
import { PICK_COUNTS } from "@/lib/picks";
import { STAKE_VERSION } from "@/lib/picks-advice";
import { hitRatePeriod, LEARNING_VERSION } from "@/lib/picks-learning";
import { picksHref, TAB_GROUPS, type TabId } from "@/lib/picks-tabs";
import { BankrollInput } from "./BankrollInput";
import { LinkPending } from "./LinkPending";

/** Everything you choose, on the left of the list. On phones it collapses to one row of buttons. */
export function TabNav({ tab, count, hit, hitPeriod, source }: { tab: TabId; count: number; hit: (id: string) => Metric | null; hitPeriod: string; source: string }) {
  return (
    <aside className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:space-y-6 lg:self-start">
      <nav
        aria-label="Bet-type"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [mask-image:linear-gradient(to_right,black_85%,transparent)] [scrollbar-width:none] after:w-4 after:shrink-0 after:content-[''] lg:mx-0 lg:block lg:space-y-5 lg:overflow-visible lg:px-0 lg:[mask-image:none] lg:after:hidden"
      >
        {TAB_GROUPS.map((g) => (
          <div key={g.title} className="contents lg:block">
            <div className="mb-1.5 hidden px-3 text-xs font-semibold text-muted lg:block">{g.title}</div>
            {g.tabs.map((x) => {
              const h = hit(x.id);
              const active = x.id === tab;
              return (
                <Link
                  key={x.id}
                  href={picksHref(x.id, count)}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  title={h ? `Træfprocent ${Math.round(h.value * 100)} % i ${h.n} afgjorte bets, ${hitRatePeriod([h])} (historisk, ${h.source}, ${h.modelVersion})` : undefined}
                  className={`relative flex shrink-0 items-center justify-between gap-3 whitespace-nowrap rounded-full border px-4 py-2 text-[15px] font-medium lg:border-0 lg:px-4 ${
                    active ? "border-lime bg-lime font-semibold text-accent" : "border-line bg-surface text-ink-2 hover:text-accent lg:bg-transparent lg:hover:bg-surface-2"
                  }`}
                >
                  {x.label}
                  {h && <span className={`num hidden text-xs lg:inline ${active ? "text-accent/80" : "text-muted"}`}>{Math.round(h.value * 100)}%</span>}
                  <LinkPending />
                </Link>
              );
            })}
            {g.title === "Spillere" && (
              <Link
                href="/picks/spillere"
                className="flex shrink-0 items-center justify-between gap-3 whitespace-nowrap rounded-full border border-line bg-surface px-4 py-2 text-[15px] font-medium text-ink-2 hover:text-accent lg:border-0 lg:bg-transparent lg:px-4 lg:hover:bg-surface-2"
              >
                Holdsøgning
              </Link>
            )}
          </div>
        ))}
      </nav>
      <p className="hidden px-4 text-xs leading-relaxed text-muted lg:block">
        Tallet er træfprocenten for de afgjorte bets ({hitPeriod}, {source}, {LEARNING_VERSION}).
      </p>

      <div className="flex flex-wrap items-center gap-3 lg:block lg:space-y-3 lg:rounded-[20px] lg:bg-surface-2 lg:p-4">
        <nav aria-label="Antal bets" className="flex rounded-full bg-surface-2 p-1 lg:bg-surface-3">
          {PICK_COUNTS.map((n) => (
            <Link
              key={n}
              href={picksHref(tab, n)}
              scroll={false}
              aria-current={n === count ? "page" : undefined}
              className={`relative flex-1 whitespace-nowrap rounded-full px-4 py-1.5 text-center text-sm font-semibold ${n === count ? "bg-accent text-white" : "text-ink-2 hover:text-accent"}`}
            >
              Top {n}
              <LinkPending />
            </Link>
          ))}
        </nav>
        <BankrollInput />
        <details className="basis-full text-xs text-muted">
          <summary className="cursor-pointer font-medium text-accent underline underline-offset-2">Sådan regner vi indsatsen</summary>
          <p className="mt-1.5 leading-relaxed">
            Indsatsforslag efter kvart-Kelly: en fjerdedel af det, Kelly-formlen giver ud fra chance og odds, højst 5 % af puljen. Er oddsen lavere end vores fair odds, er
            der ingen værdi, og forslaget er en lille fast indsats på 1 %. Skøn, {STAKE_VERSION}.
          </p>
        </details>
      </div>
    </aside>
  );
}
