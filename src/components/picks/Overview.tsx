// The dashboard strip at the top of Dagens bedste bets: today's biggest price
// difference, what was analysed, and how the last seven days went, each with a
// small day-by-day chart.

import Link from "next/link";
import { clock, dec, krFromUnits, pctTight } from "@/lib/format";
import { byDay, resultsContext, summarise, roiLabel, ROI_MIN, type RecordedPick } from "@/lib/picks-extra";
import { LEARNING_VERSION } from "@/lib/picks-learning";
import { Badge } from "@/components/ui";
import { HitBars, ProfitBars, Tile } from "./charts";

export interface TopBet {
  outcome: string;
  match: string;
  league: string;
  kickoff: number;
  probability: number;
  odds: number | null;
  /** Footnote under the tile; defaults to the model's estimated chance. */
  note?: string;
  /** Shown as the big number instead of the chance, with a caption under the outcome. */
  headline?: { value: string; caption: string };
}

export function Overview({
  top,
  matches,
  leagues,
  nextKickoff,
  feedTime,
  live,
  week,
  source,
  topLabel,
  version = LEARNING_VERSION,
  className = "",
}: {
  className?: string;
  top: TopBet | null;
  topLabel: string;
  /** The rule or model version the week's picks were made with. */
  version?: string;
  matches: number;
  leagues: number;
  nextKickoff: number | null;
  feedTime: number;
  /** False on demo data: the feed tile then says DEMO DATA. */
  live: boolean;
  /** Settled "bedste" picks from the last seven days. */
  week: RecordedPick[];
  source: string;
}) {
  const s = summarise(week);
  const days = byDay(week);
  const context = resultsContext(week, source, version);
  // Too few bets for the return to mean much: the figure stays neutral and says so, instead of shouting in green.
  const thin = s.withOdds < ROI_MIN;
  const cols = top ? "lg:grid-cols-4" : "lg:grid-cols-3";

  return (
    <div className={`grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 ${cols} ${className}`}>
      {top ? (
        <Tile bare label={topLabel} className="bg-accent-soft sm:col-span-2 lg:col-span-1" foot={top.note ?? "Estimeret chance fra modellen og bookmakernes odds. Ikke en garanti."}>
          <a href="#bet-1" className="group block rounded-field">
            <div className="flex items-baseline justify-between gap-3">
              <span className="figure whitespace-nowrap text-[44px] text-accent">{top.headline?.value ?? pctTight(top.probability)}</span>
              {top.odds && <span className="num text-sm text-ink-2">odds {dec(top.odds)}</span>}
            </div>
            {top.headline && <div className="mt-1 text-sm text-ink-2">{top.headline.caption}</div>}
            <div className="mt-2 truncate font-semibold text-ink group-hover:text-accent">{top.outcome} →</div>
            <div className="truncate text-sm text-ink-2">
              {top.match.replace(" vs ", " – ")} · kl. {clock(top.kickoff)}
            </div>
          </a>
        </Tile>
      ) : null}

      <Tile bare label="Analyseret nu" className="bg-surface" foot={`Odds opdateret kl. ${clock(feedTime)}. ${live ? "Live tal." : "DEMO DATA."}`}>
        <div className="flex items-baseline gap-2">
          <span className="figure text-[44px] text-ink">{matches}</span>
          <span className="text-sm text-ink-2">
            kampe i {leagues} {leagues === 1 ? "liga" : "ligaer"}
          </span>
        </div>
        {nextKickoff && (
          <div className="mt-2 inline-flex items-center gap-2 text-sm text-ink-2">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
            Næste kamp kl. <span className="num font-semibold text-ink">{clock(nextKickoff)}</span>
          </div>
        )}
      </Tile>

      <Tile bare label="Ramte, sidste 7 dage" className="bg-surface" foot={context}>
        {s.settled ? (
          <Link href="/picks/resultater" className="group block space-y-3 rounded-field" aria-label={`Ramte ${pctTight(s.won / s.settled)}, ${s.won} af ${s.settled}. Se resultaterne`}>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="figure whitespace-nowrap text-[44px] text-ink">{pctTight(s.won / s.settled)}</span>
              <span className="text-sm text-ink-2">
                {s.won} af {s.settled}
              </span>
            </div>
            <HitBars days={days} focusable={false} />
          </Link>
        ) : (
          <div className="text-sm text-ink-2">Ingen afgjorte bets endnu.</div>
        )}
      </Tile>

      <Tile bare label="Gevinst, 100 kr pr. bet" className={`bg-surface ${top ? "" : "sm:col-span-2 lg:col-span-1"}`} foot={s.withOdds ? `${context}. Kun bets med odds (${s.withOdds}).` : undefined}>
        {s.withOdds ? (
          <Link href="/picks/resultater" className="group block space-y-3 rounded-field" aria-label={`Gevinst ${krFromUnits(s.profit)}, afkast ${roiLabel(s)}. Se resultaterne`}>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className={`figure whitespace-nowrap text-[44px] ${thin ? "text-ink" : s.profit >= 0 ? "text-good" : "text-serious"}`}>{krFromUnits(s.profit)}</span>
              <span className="text-sm text-ink-2">afkast {roiLabel(s).replace(/ \(.*\)$/, "")}</span>
              {thin && <Badge tone="warning">Lille datagrundlag</Badge>}
            </div>
            <ProfitBars days={days} focusable={false} />
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
export function GoodSingles({ rows, subtitle = "Højest chance først" }: { rows: SingleRow[]; subtitle?: string }) {
  if (rows.length === 0) return null;
  return (
    <section className="rise overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-4">
        <h2 className="text-lg font-semibold">Gode enkeltbets</h2>
        <span className="text-xs text-ink-2">{subtitle} · tryk for analysen</span>
      </div>
      <ol className="divide-y divide-line">
        {rows.map((r, i) => (
          <li key={r.key}>
            <a href={`#bet-${i + 1}`} className="group flex min-h-16 items-center gap-4 px-5 py-3 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:-outline-offset-2">
              <span className="figure w-6 shrink-0 text-lg text-muted group-hover:text-accent">{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-semibold">{r.outcome}</span>
                  {r.value && <Badge tone="good">Værdi</Badge>}
                </span>
                <span className="block truncate text-sm text-ink-2">
                  {r.match.replace(" vs ", " – ")} · {r.league} · kl. {clock(r.kickoff)}
                </span>
              </span>
              <span className="hidden w-28 shrink-0 sm:block" aria-hidden>
                <span className="block h-1 overflow-hidden rounded-full bg-surface-3">
                  <span className="grow-x block h-full rounded-full bg-ink/80" style={{ width: `${Math.round(r.probability * 100)}%` }} />
                </span>
              </span>
              <span className="figure w-14 shrink-0 text-right text-2xl">{pctTight(r.probability)}</span>
              <span className="num hidden w-14 shrink-0 text-right text-sm text-ink-2 sm:block">{r.odds ? dec(r.odds) : "—"}</span>
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
