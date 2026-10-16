// The bet-type menu beside the list, with each type's hit rate, the Top 5/10
// switch, the bankroll and how the stake is worked out.

import Link from "next/link";
import { Fragment } from "react";
import type { Metric } from "@/lib/metrics/metric";
import { PICK_COUNTS } from "@/lib/picks";
import { STAKE_VERSION } from "@/lib/picks-advice";
import { hitRatePeriod, RECORD_VERSIONS } from "@/lib/picks-learning";
import { picksHref, TAB_GROUPS, type TabId } from "@/lib/picks-tabs";
import { BankrollInput } from "./BankrollInput";
import { LinkPending } from "./LinkPending";
import { chipClass, segmentClass, segmentedGroup } from "@/components/ui";

/** Everything you choose, on the left of the list. On phones it collapses to one row of buttons. */
export function TabNav({ tab, count, hit, hitPeriod, source }: { tab: TabId; count: number; hit: (id: string) => Metric | null; hitPeriod: string; source: string }) {
  return (
    <aside className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:space-y-6 lg:self-start">
      <nav
        aria-label="Bet-type"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scroll-fade-x [scrollbar-width:none] after:w-4 after:shrink-0 after:content-[''] lg:mx-0 lg:block lg:space-y-5 lg:overflow-visible lg:px-0 lg:[mask-image:none] lg:after:hidden"
      >
        {TAB_GROUPS.map((g) => (
          <div key={g.title} className="contents lg:block">
            <div className="eyebrow mb-1.5 hidden px-3 lg:block">{g.title}</div>
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
                  className={chipClass(
                    active,
                    `lg:flex lg:w-full lg:justify-between lg:rounded-field lg:border-transparent lg:px-3 lg:text-md lg:min-h-10 ${active ? "lg:bg-accent-fill" : "lg:bg-transparent lg:hover:bg-surface-2"}`,
                  )}
                >
                  {x.label}
                  {h && (
                    <span className={`num hidden text-xs lg:inline ${active ? "text-accent" : "text-ink-2"}`}>
                      {Math.round(h.value * 100)}&nbsp;% <span className={active ? "text-accent/70" : "text-muted"}>({h.n})</span>
                    </span>
                  )}
                  <LinkPending />
                </Link>
              );
            })}
            {g.title === "Spillere" && (
              <Link
                href="/picks/spillere"
                className={chipClass(false, "lg:flex lg:w-full lg:justify-between lg:rounded-field lg:border-transparent lg:bg-transparent lg:px-3 lg:text-md lg:min-h-10 lg:hover:bg-surface-2")}
              >
                Holdsøgning <span aria-hidden className="text-muted">↗</span>
              </Link>
            )}
          </div>
        ))}
      </nav>
      <p className="hidden px-3 text-xs leading-relaxed text-ink-2/80 lg:block">
        Tallet er træfprocenten for de afgjorte bets, historisk, og i parentes antallet af bets. {hitPeriod} · {source}
        {RECORD_VERSIONS.map((v) => (
          <Fragment key={v}>
            {" · "}
            <span className="whitespace-nowrap">{v}</span>
          </Fragment>
        ))}
      </p>

      <PickControls tab={tab} count={count} className="hidden lg:block" />
    </aside>
  );
}

/**
 * Top 5 / Top 10, the bankroll and how the stake is worked out. In the side menu from 1024 px; on phones the page puts
 * it just above the bet cards it changes, so it does not push the coupons down.
 */
export function PickControls({ tab, count, className = "" }: { tab: TabId; count: number; className?: string }) {
  return (
      <div className={`flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface p-3 lg:block lg:space-y-4 lg:p-4 ${className}`}>
        <nav aria-label="Antal bets" className={`${segmentedGroup} max-lg:flex-1`}>
          {PICK_COUNTS.map((n) => (
            <Link
              key={n}
              href={picksHref(tab, n)}
              scroll={false}
              aria-current={n === count ? "page" : undefined}
              className={segmentClass(n === count)}
            >
              Top {n}
              <LinkPending />
            </Link>
          ))}
        </nav>
        <BankrollInput />
        <details className="group basis-full text-xs text-ink-2">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 font-semibold text-accent sm:min-h-8">
            Sådan regner vi indsatsen
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M4 6l4 4 4-4" />
            </svg>
          </summary>
          <p className="mt-1 leading-relaxed">
            Indsatsforslag efter kvart-Kelly: en fjerdedel af det, Kelly-formlen giver ud fra chance og odds, højst 5 % af puljen. Er oddsen lavere end vores fair odds, er
            der ingen værdi, og forslaget er en lille fast indsats på 1 %. Skøn, {STAKE_VERSION}.
          </p>
        </details>
      </div>
  );
}
