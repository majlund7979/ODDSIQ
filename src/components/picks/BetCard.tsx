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
    <div className="w-24 shrink-0 text-center">
      <div className="num text-[34px] font-extrabold leading-none tracking-[-0.03em] text-ink">{pct}%</div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <div className={`h-full rounded-full ${p >= 0.7 ? "bg-good" : "bg-accent"}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1.5 text-[11px] text-muted">chance</div>
    </div>
  );
}

/** League, kickoff and risk level above the team names on every card. */
export function CardTop({ rank, league, kickoff, probability, now }: { rank: number; league: string; kickoff: number; probability: number; now: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
      <span className="num flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[12px] font-bold text-white">{rank}</span>
      <span>{league}</span>
      <span aria-hidden>·</span>
      <span>{kickoffLabel(kickoff, now)}</span>
      {isFriendly(league) && (
        <span
          className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning"
          title="Venskabskampe er sværere at forudsige: holdene roterer, og der er ikke meget på spil. Procenten er mere usikker end normalt."
        >
          Venskabskamp, mere usikker
        </span>
      )}
      <RiskBadge p={probability} className="ml-auto sm:ml-2" />
    </div>
  );
}

export function MatchTitle({ home, away }: { home: string; away: string }) {
  return (
    <h2 className="text-xl font-bold leading-tight tracking-[-0.01em] sm:text-[22px]">
      {home} <span className="text-muted">–</span> {away}
    </h2>
  );
}

/** The box beside the gauge: odds, a line or a fair price, with a short note under it. */
export function StatBox({ label, value, sub, truncate = false, children }: { label: string; value: string; sub: React.ReactNode; truncate?: boolean; children?: React.ReactNode }) {
  return (
    <div className="min-w-[96px] rounded-2xl bg-surface-2 px-3 py-2.5 text-center">
      <div className="text-[11px] font-medium text-muted">{label}</div>
      <div className="num text-2xl font-semibold">{value}</div>
      <div className={`${truncate ? "truncate " : ""}text-[11px] text-ink-2`}>{sub}</div>
      {children}
    </div>
  );
}

/** Home's and away's expected count side by side, with home's share as a bar. */
export function SplitBar({ home, away }: { home: number; away: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="num text-lg font-semibold">{dec(home, 1)}</span>
      <div className="flex h-2 flex-1 overflow-hidden rounded bg-surface-3">
        <span className="bg-accent" style={{ width: `${(home / (home + away)) * 100}%` }} />
        <span className="flex-1 bg-model/70" />
      </div>
      <span className="num text-lg font-semibold">{dec(away, 1)}</span>
    </div>
  );
}

export function MoreToggle() {
  return (
    <summary className="flex cursor-pointer list-none items-center justify-center gap-2 border-t border-line px-5 py-3 text-sm font-semibold text-accent hover:bg-surface-2">
      <span className="group-open:hidden">Hvorfor? Se analysen</span>
      <span className="hidden group-open:inline">Skjul analysen</span>
      <span className="transition-transform group-open:rotate-180" aria-hidden>
        ▾
      </span>
    </summary>
  );
}

export function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[13px] font-semibold text-ink-2">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}
