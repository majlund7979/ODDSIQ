// The small results tiles and day-by-day charts shared by the /picks dashboard,
// the results board and the friends' league.

import { krFromUnits, pct } from "@/lib/format";
import type { DayStat } from "@/lib/picks-extra";

const shortDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("da-DK", { weekday: "short", timeZone: "UTC" }).replace(".", "");
const longDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });

export function Tile({ label, children, foot, className = "" }: { label: string; children: React.ReactNode; foot?: React.ReactNode; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col rounded-2xl border border-line bg-page/40 p-3.5 sm:p-4 ${className}`}>
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-2 flex-1">{children}</div>
      {foot && <div className="mt-3 text-[11px] leading-snug text-muted">{foot}</div>}
    </div>
  );
}

/** One column per day: the share of bets that won, with a tick at what we expected. */
export function HitBars({ days }: { days: DayStat[] }) {
  return (
    <div className="flex h-14 items-end gap-1.5" role="img" aria-label={days.map((d) => `${longDay(d.day)}: ${d.won} af ${d.settled}`).join(", ")}>
      {days.map((d, i) => {
        const share = d.settled ? d.won / d.settled : 0;
        return (
          <span key={d.day} className={`tip relative flex h-full flex-1 flex-col items-center justify-end ${i >= days.length / 2 ? "tip-end" : ""}`} tabIndex={0}>
            <span className="relative w-full flex-1">
              <span className="absolute inset-x-0 bottom-0 rounded-t bg-accent" style={{ height: `${Math.max(4, share * 100)}%` }} />
              <span className="absolute inset-x-[-2px] h-0.5 rounded bg-ink/70" style={{ bottom: `${d.expected * 100}%` }} aria-hidden />
            </span>
            <span className="mt-1 text-[10px] leading-none text-muted">{shortDay(d.day)}</span>
            <span role="tooltip" className="tip-body">
              <span className="font-semibold text-ink">{longDay(d.day)}</span>
              <br />
              {d.won} af {d.settled} gik hjem ({pct(share)}), vi regnede med {pct(d.expected)}.
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** One column per day: profit at 100 kr a bet, above or below zero. */
export function ProfitBars({ days }: { days: DayStat[] }) {
  const max = Math.max(0.5, ...days.map((d) => Math.abs(d.profit)));
  return (
    <div className="flex h-14 gap-1.5" role="img" aria-label={days.map((d) => `${longDay(d.day)}: ${krFromUnits(d.profit)}`).join(", ")}>
      {days.map((d, i) => {
        const h = (Math.abs(d.profit) / max) * 50;
        return (
          <span key={d.day} className={`tip relative flex flex-1 flex-col ${i >= days.length / 2 ? "tip-end" : ""}`} tabIndex={0}>
            <span className="relative flex-1">
              <span className="absolute inset-x-[-2px] top-1/2 h-px bg-line-strong" aria-hidden />
              {d.withOdds > 0 && (
                <span
                  className={`absolute inset-x-0 ${d.profit >= 0 ? "rounded-t bg-good" : "rounded-b bg-serious"}`}
                  style={d.profit >= 0 ? { bottom: "50%", height: `${Math.max(2, h)}%` } : { top: "50%", height: `${Math.max(2, h)}%` }}
                />
              )}
            </span>
            <span className="mt-1 text-center text-[10px] leading-none text-muted">{shortDay(d.day)}</span>
            <span role="tooltip" className="tip-body">
              <span className="font-semibold text-ink">{longDay(d.day)}</span>
              <br />
              {d.withOdds ? `${krFromUnits(d.profit)} ved 100 kr på hvert af ${d.withOdds} bets med odds.` : "Ingen bets med odds."}
            </span>
          </span>
        );
      })}
    </div>
  );
}
