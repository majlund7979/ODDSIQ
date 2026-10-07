// The dashboard strip at the top of Dagens bedste bets: today's safest bet, what was
// analysed, and how the last seven days went, each with a small day-by-day chart.

import Link from "next/link";
import { summarise, roiLabel, ROI_MIN, type RecordedPick } from "@/lib/picks-extra";
import { LEARNING_VERSION } from "@/lib/picks-learning";

const TZ = "Europe/Copenhagen";
const pct = (x: number) => `${Math.round(x * 100)} %`;
/** Big headline numbers read better without the space. */
const big = (x: number) => `${Math.round(x * 100)}%`;
const kr = (units: number) => `${units >= 0 ? "+" : "−"}${Math.round(Math.abs(units) * 100)} kr`;
const dec = (x: number) => x.toFixed(2).replace(".", ",");
const clock = (t: number) => new Date(t).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", timeZone: TZ, hour12: false });
const shortDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("da-DK", { weekday: "short", timeZone: "UTC" }).replace(".", "");
const longDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });

export interface TopBet {
  outcome: string;
  match: string;
  league: string;
  kickoff: number;
  probability: number;
  odds: number | null;
  /** Footnote under the tile; defaults to the model's estimated chance. */
  note?: string;
}

interface DayStat {
  day: string;
  won: number;
  settled: number;
  expected: number;
  profit: number;
  withOdds: number;
}

/** Settled picks per day, oldest first. Pure. */
export function byDay(picks: RecordedPick[]): DayStat[] {
  const days = new Map<string, RecordedPick[]>();
  for (const p of picks) if (p.result) days.set(p.day, [...(days.get(p.day) ?? []), p]);
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, ps]) => {
      const s = summarise(ps);
      return { day, won: s.won, settled: s.settled, expected: s.expectedRate, profit: s.profit, withOdds: s.withOdds };
    });
}

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
    <div className="flex h-14 gap-1.5" role="img" aria-label={days.map((d) => `${longDay(d.day)}: ${kr(d.profit)}`).join(", ")}>
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
              {d.withOdds ? `${kr(d.profit)} ved 100 kr på hvert af ${d.withOdds} bets med odds.` : "Ingen bets med odds."}
            </span>
          </span>
        );
      })}
    </div>
  );
}

export function Overview({
  top,
  matches,
  leagues,
  nextKickoff,
  feedTime,
  week,
  source,
  topLabel = "Dagens sikreste bet",
  empty = "Ingen kampe de næste 24 timer.",
}: {
  top: TopBet | null;
  topLabel?: string;
  /** Shown in the first tile when there is no bet. */
  empty?: string;
  matches: number;
  leagues: number;
  nextKickoff: number | null;
  feedTime: number;
  /** Settled "bedste" picks from the last seven days. */
  week: RecordedPick[];
  source: string;
}) {
  const s = summarise(week);
  const days = byDay(week);
  const settled = week.filter((p) => p.result);
  const from = settled.length ? Math.min(...settled.map((p) => p.kickoff)) : null;
  const to = settled.length ? Math.max(...settled.map((p) => p.kickoff)) : null;
  const period =
    from && to
      ? `${new Date(from).toLocaleDateString("da-DK", { day: "numeric", month: "short", timeZone: TZ })}–${new Date(to).toLocaleDateString("da-DK", { day: "numeric", month: "short", timeZone: TZ })}`
      : "sidste 7 dage";
  const context = `Historisk · n = ${s.settled} · ${period} · ${source} · ${LEARNING_VERSION}`;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label={topLabel} className="col-span-2 lg:col-span-1" foot={top ? (top.note ?? "Estimeret chance fra modellen og bookmakernes odds. Ikke en garanti.") : undefined}>
        {top ? (
          <a href="#bet-1" className="group block">
            <div className="flex items-baseline justify-between gap-3">
              <span className="num whitespace-nowrap text-4xl font-extrabold tracking-[-0.03em] text-ink">{big(top.probability)}</span>
              {top.odds && <span className="num text-sm text-ink-2">odds {dec(top.odds)}</span>}
            </div>
            <div className="mt-1 truncate font-semibold text-accent group-hover:underline">{top.outcome}</div>
            <div className="truncate text-sm text-ink-2">
              {top.match.replace(" vs ", " – ")} · kl. {clock(top.kickoff)}
            </div>
          </a>
        ) : (
          <div className="text-sm text-ink-2">{empty}</div>
        )}
      </Tile>

      <Tile label="Analyseret nu" className="col-span-2 lg:col-span-1" foot={`Odds opdateret kl. ${clock(feedTime)}. Live tal.`}>
        <div className="num text-2xl font-extrabold tracking-[-0.02em] text-ink sm:text-3xl">{matches}</div>
        <div className="text-sm text-ink-2">
          kampe i {leagues} {leagues === 1 ? "liga" : "ligaer"}
        </div>
        {nextKickoff && <div className="mt-1 text-sm text-ink-2">Næste kamp kl. {clock(nextKickoff)}</div>}
      </Tile>

      <Tile label="Ramte, sidste 7 dage" foot={context}>
        {s.settled ? (
          <Link href="/picks/resultater" className="block space-y-2">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="num whitespace-nowrap text-2xl font-extrabold tracking-[-0.02em] text-ink sm:text-3xl">{big(s.won / s.settled)}</span>
              <span className="text-sm text-ink-2">
                {s.won} af {s.settled}
              </span>
            </div>
            <HitBars days={days} />
          </Link>
        ) : (
          <div className="text-sm text-ink-2">Ingen afgjorte bets endnu.</div>
        )}
      </Tile>

      <Tile label="Gevinst, 100 kr pr. bet" foot={s.withOdds ? `${context}. Kun bets med odds (${s.withOdds}).` : undefined}>
        {s.withOdds ? (
          <Link href="/picks/resultater" className="block space-y-2">
            <div className="flex items-baseline gap-2">
              <span className={`num whitespace-nowrap text-2xl font-extrabold tracking-[-0.02em] sm:text-3xl ${s.profit >= 0 ? "text-good" : "text-serious"}`}>{kr(s.profit)}</span>
              <span className={`text-sm ${s.withOdds < ROI_MIN ? "text-muted" : "text-ink-2"}`}>afkast {roiLabel(s)}</span>
            </div>
            <ProfitBars days={days} />
          </Link>
        ) : (
          <div className="text-sm text-ink-2">Ingen afgjorte bets med odds endnu.</div>
        )}
      </Tile>
    </div>
  );
}

export interface SingleRow {
  key: string;
  eventId: string;
  outcome: string;
  match: string;
  league: string;
  kickoff: number;
  probability: number;
  odds: number | null;
  value: boolean;
}

/** The day's best single bets as a compact list; each row jumps to its full card below. */
export function GoodSingles({ rows }: { rows: SingleRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="overflow-hidden rounded-[20px] border border-line bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3.5">
        <h2 className="text-lg font-bold">Gode enkeltbets</h2>
        <span className="text-xs text-muted">Højest chance først · tryk for analysen</span>
      </div>
      <ol className="divide-y divide-line">
        {rows.map((r, i) => (
          <li key={r.key} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2">
            <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-semibold text-ink">{i + 1}</span>
            <a href={`#bet-${i + 1}`} className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate font-semibold">{r.outcome}</span>
                {r.value && <span className="shrink-0 rounded-full border border-good/40 bg-good/10 px-1.5 text-[10px] font-semibold text-good">Værdi</span>}
              </span>
              <span className="block truncate text-xs text-muted">
                {r.match.replace(" vs ", " – ")} · {r.league} · kl. {clock(r.kickoff)}
              </span>
            </a>
            <span className="hidden w-28 shrink-0 sm:block" aria-hidden>
              <span className="block h-1.5 overflow-hidden rounded-full bg-surface-3">
                <span className={`block h-full rounded-full ${r.probability >= 0.7 ? "bg-good" : "bg-accent"}`} style={{ width: `${Math.round(r.probability * 100)}%` }} />
              </span>
            </span>
            <span className="num w-12 shrink-0 text-right text-lg font-bold">{pct(r.probability).replace(" ", "")}</span>
            <span className="num hidden w-14 shrink-0 text-right text-sm text-ink-2 sm:block">{r.odds ? dec(r.odds) : "—"}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
