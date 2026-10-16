// The pieces every bet card on /picks shares: the top line with league and
// kickoff, the chance gauge, the "Hvorfor?" toggle and the fact blocks.

import { clock, dayKey, dec, TZ } from "@/lib/format";
import { isFriendly } from "@/lib/picks-advice";
import { RiskBadge } from "./Advice";

export function kickoffLabel(t: number, now: number) {
  const day = dayKey(t) === dayKey(now) ? "I dag" : dayKey(t) === dayKey(now + 86_400_000) ? "I morgen" : new Date(t).toLocaleDateString("da-DK", { weekday: "long", timeZone: TZ });
  return `${day} kl. ${clock(t)}`;
}

export function Gauge({ p }: { p: number }) {
  const pct = Math.round(p * 100);
  return (
    <div className="w-24 shrink-0">
      <div className="figure text-[40px] text-ink">
        {pct}
        <span className="ml-0.5 text-[22px] text-ink-2">%</span>
      </div>
      <div className="relative mt-2.5 h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <div className="grow-x h-full rounded-full bg-ink" style={{ width: `${pct}%` }} />
      </div>
      <div className="eyebrow mt-2">chance</div>
    </div>
  );
}

/** League, kickoff and risk level above the team names on every card. */
export function CardTop({ rank, league, kickoff, probability, now }: { rank: number; league: string; kickoff: number; probability: number; now: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm text-ink-2">
      <span className="figure text-lg text-accent" aria-label={`Nummer ${rank}`}>
        {String(rank).padStart(2, "0")}
      </span>
      <span aria-hidden className="h-3.5 w-px bg-line-strong" />
      <span className="font-medium text-ink">{league}</span>
      <span aria-hidden className="text-muted">·</span>
      <span>{kickoffLabel(kickoff, now)}</span>
      {isFriendly(league) && (
        <span
          className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-semibold leading-4 text-warning"
          title="Venskabskampe er sværere at forudsige: holdene roterer, og der er ikke meget på spil. Procenten er mere usikker end normalt."
        >
          Venskabskamp, mere usikker
        </span>
      )}
      <RiskBadge p={probability} className="ml-auto" />
    </div>
  );
}

export function MatchTitle({ home, away }: { home: string; away: string }) {
  return (
    <h2 className="text-balance text-[22px] font-bold leading-tight tracking-[-0.015em] sm:text-2xl">
      {home} <span className="font-normal text-muted">–</span> {away}
    </h2>
  );
}

/** The box beside the gauge: odds, a line or a fair price, with a short note under it. */
export function StatBox({ label, value, sub, truncate = false, children }: { label: string; value: string; sub: React.ReactNode; truncate?: boolean; children?: React.ReactNode }) {
  return (
    <div className="min-w-[104px] max-w-[140px] rounded-field border border-line bg-surface-2 px-3.5 py-3">
      <div className="eyebrow">{label}</div>
      <div className="figure mt-1.5 text-[28px] text-ink">{value}</div>
      <div className={`${truncate ? "truncate " : ""}mt-1 text-xs text-ink-2`}>{sub}</div>
      {children}
    </div>
  );
}

/** Home's and away's expected count side by side, with home's share as a bar. */
export function SplitBar({ home, away }: { home: number; away: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="num text-lg font-semibold">{dec(home, 1)}</span>
      <div className="flex h-2 flex-1 gap-0.5 overflow-hidden rounded-full">
        <span className="rounded-l-full bg-market" style={{ width: `${(home / (home + away)) * 100}%` }} />
        <span className="flex-1 rounded-r-full bg-model/80" />
      </div>
      <span className="num text-lg font-semibold">{dec(away, 1)}</span>
    </div>
  );
}

export function MoreToggle() {
  return (
    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-center gap-2 border-t border-line px-5 text-sm font-semibold text-accent transition-colors hover:bg-accent-soft focus-visible:-outline-offset-2">
      <span className="group-open:hidden">Hvorfor? Se analysen</span>
      <span className="hidden group-open:inline">Skjul analysen</span>
      <svg viewBox="0 0 16 16" className="h-4 w-4 transition-transform duration-300 group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 6l4 4 4-4" />
      </svg>
    </summary>
  );
}

export function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="eyebrow">{label}</div>
      <div className="text-sm leading-relaxed">{children}</div>
    </div>
  );
}
