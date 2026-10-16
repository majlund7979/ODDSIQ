// The small results tiles and day-by-day charts shared by the /picks dashboard,
// the results board and the friends' league.

import { krFromUnits, pct } from "@/lib/format";
import type { DayStat } from "@/lib/picks-extra";

const shortDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("da-DK", { weekday: "short", timeZone: "UTC" }).replace(".", "");
const longDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });

/**
 * One figure with its label and source line. `bare` drops the card so tiles can sit side by side inside one panel,
 * divided by hairlines like the cells of a scoreboard.
 */
export function Tile({ label, children, foot, className = "", bare = false }: { label: string; children: React.ReactNode; foot?: React.ReactNode; className?: string; bare?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col ${bare ? "p-5" : "rounded-card border border-line bg-surface p-4 sm:p-5"} ${className}`}>
      <div className="eyebrow">{label}</div>
      <div className="mt-3 flex-1">{children}</div>
      {foot && <div className="mt-4 text-xs leading-snug text-ink-2/80">{foot}</div>}
    </div>
  );
}

/** One column per day: the share of bets that won, with a tick at what we expected. Inside a link, `focusable={false}` leaves the bars out of the tab order. */
export function HitBars({ days, focusable = true }: { days: DayStat[]; focusable?: boolean }) {
  return (
    <div className="flex h-16 items-end gap-1.5" role="img" aria-label={days.map((d) => `${longDay(d.day)}: ${d.won} af ${d.settled}`).join(", ")}>
      {days.map((d, i) => {
        const share = d.settled ? d.won / d.settled : 0;
        return (
          <span key={d.day} className={`tip relative flex h-full flex-1 flex-col items-center justify-end ${i >= days.length / 2 ? "tip-end" : ""}`} tabIndex={focusable ? 0 : undefined}>
            <span className="relative w-full flex-1 border-b border-line-strong">
              <span className="grow-y absolute inset-x-[18%] bottom-0 rounded-t-[3px] bg-ink/80" style={{ height: `${Math.max(4, share * 100)}%`, ["--i" as string]: i }} />
              <span className="absolute inset-x-[-2px] h-0.5 rounded bg-accent" style={{ bottom: `${d.expected * 100}%` }} aria-hidden />
            </span>
            <span className="mt-1.5 text-xs leading-none text-ink-2">{shortDay(d.day)}</span>
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

/** One column per day: profit at 100 kr a bet, above or below zero. `focusable` as for HitBars. */
export function ProfitBars({ days, focusable = true }: { days: DayStat[]; focusable?: boolean }) {
  const max = Math.max(0.5, ...days.map((d) => Math.abs(d.profit)));
  return (
    <div className="flex h-16 gap-1.5" role="img" aria-label={days.map((d) => `${longDay(d.day)}: ${krFromUnits(d.profit)}`).join(", ")}>
      {days.map((d, i) => {
        const h = (Math.abs(d.profit) / max) * 50;
        return (
          <span key={d.day} className={`tip relative flex flex-1 flex-col ${i >= days.length / 2 ? "tip-end" : ""}`} tabIndex={focusable ? 0 : undefined}>
            <span className="relative flex-1">
              <span className="absolute inset-x-[-2px] top-1/2 h-px bg-line-strong" aria-hidden />
              {d.withOdds > 0 && (
                <span
                  className={`absolute inset-x-[18%] ${d.profit >= 0 ? "grow-y rounded-t-[3px] bg-good" : "grow-y-down rounded-b-[3px] bg-serious"}`}
                  style={{ ...(d.profit >= 0 ? { bottom: "50%" } : { top: "50%" }), height: `${Math.max(2, h)}%`, ["--i" as string]: i }}
                />
              )}
            </span>
            <span className="mt-1.5 text-center text-xs leading-none text-ink-2">{shortDay(d.day)}</span>
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
