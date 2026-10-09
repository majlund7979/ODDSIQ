// The dashboard strip at the top of Dagens bedste bets: today's biggest price
// difference, what was analysed, and how the last seven days went, each with a
// small day-by-day chart.

import Link from "next/link";
import { clock, dec, krFromUnits, pctTight } from "@/lib/format";
import { byDay, resultsContext, summarise, roiLabel, ROI_MIN, type RecordedPick } from "@/lib/picks-extra";
import { LEARNING_VERSION } from "@/lib/picks-learning";
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
  empty = "Ingen kampe de næste 24 timer.",
  version = LEARNING_VERSION,
}: {
  top: TopBet | null;
  topLabel: string;
  /** The rule or model version the week's picks were made with. */
  version?: string;
  /** Shown in the first tile when there is no bet. */
  empty?: string;
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

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label={topLabel} className="col-span-2 lg:col-span-1" foot={top ? (top.note ?? "Estimeret chance fra modellen og bookmakernes odds. Ikke en garanti.") : undefined}>
        {top ? (
          <a href="#bet-1" className="group block">
            <div className="flex items-baseline justify-between gap-3">
              <span className="num whitespace-nowrap text-4xl font-extrabold tracking-[-0.03em] text-ink">{top.headline?.value ?? pctTight(top.probability)}</span>
              {top.odds && <span className="num text-sm text-ink-2">odds {dec(top.odds)}</span>}
            </div>
            {top.headline && <div className="text-sm text-ink-2">{top.headline.caption}</div>}
            <div className="mt-1 truncate font-semibold text-accent group-hover:underline">{top.outcome}</div>
            <div className="truncate text-sm text-ink-2">
              {top.match.replace(" vs ", " – ")} · kl. {clock(top.kickoff)}
            </div>
          </a>
        ) : (
          <div className="text-sm text-ink-2">{empty}</div>
        )}
      </Tile>

      <Tile label="Analyseret nu" className="col-span-2 lg:col-span-1" foot={`Odds opdateret kl. ${clock(feedTime)}. ${live ? "Live tal." : "DEMO DATA."}`}>
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
              <span className="num whitespace-nowrap text-2xl font-extrabold tracking-[-0.02em] text-ink sm:text-3xl">{pctTight(s.won / s.settled)}</span>
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

      <Tile label="Gevinst, 100 kr pr. bet" foot={s.withOdds ? `${context}. Kun bets med odds (${s.withOdds}).` : undefined}>
        {s.withOdds ? (
          <Link href="/picks/resultater" className="block space-y-2">
            <div className="flex items-baseline gap-2">
              <span className={`num whitespace-nowrap text-2xl font-extrabold tracking-[-0.02em] sm:text-3xl ${s.profit >= 0 ? "text-good" : "text-serious"}`}>{krFromUnits(s.profit)}</span>
              <span className={`text-sm ${s.withOdds < ROI_MIN ? "text-muted" : "text-ink-2"}`}>afkast {roiLabel(s)}</span>
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
    <section className="overflow-hidden rounded-[20px] border border-line bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3.5">
        <h2 className="text-lg font-bold">Gode enkeltbets</h2>
        <span className="text-xs text-muted">{subtitle} · tryk for analysen</span>
      </div>
      <ol className="divide-y divide-line">
        {rows.map((r, i) => (
          <li key={r.key}>
            <a href={`#bet-${i + 1}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:-outline-offset-2">
              <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-semibold text-ink">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-semibold">{r.outcome}</span>
                  {r.value && <span className="shrink-0 rounded-full border border-good/40 bg-good/10 px-1.5 text-[10px] font-semibold text-good">Værdi</span>}
                </span>
                <span className="block truncate text-xs text-muted">
                  {r.match.replace(" vs ", " – ")} · {r.league} · kl. {clock(r.kickoff)}
                </span>
              </span>
              <span className="hidden w-28 shrink-0 sm:block" aria-hidden>
                <span className="block h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <span className={`block h-full rounded-full ${r.probability >= 0.7 ? "bg-good" : "bg-accent"}`} style={{ width: `${Math.round(r.probability * 100)}%` }} />
                </span>
              </span>
              <span className="num w-12 shrink-0 text-right text-lg font-bold">{pctTight(r.probability)}</span>
              <span className="num hidden w-14 shrink-0 text-right text-sm text-ink-2 sm:block">{r.odds ? dec(r.odds) : "—"}</span>
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
