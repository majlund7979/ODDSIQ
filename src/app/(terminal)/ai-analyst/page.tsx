import Link from "next/link";
import { WatchToggle } from "@/components/WatchButtons";
import { Badge, PageHeader, Panel, Signed } from "@/components/ui";
import { ANALYST_EXAMPLES, parseQuestion } from "@/lib/demo/analyst";
import { COMMENTARY_NOTE, marketCommentary } from "@/lib/demo/commentary";
import { assistantAnswerOf, teamRecordOf, watchedRowsOf, type TeamRecord } from "@/lib/demo/personal";
import { reportHeadline, reportWeeks, weeklyReport } from "@/lib/demo/report";
import type { MarketRow } from "@/lib/demo/store";
import { fmtCountdown, fmtDate, fmtOdds, fmtPct, fmtPp, fmtSignedPct } from "@/lib/format";
import { readThreshold, readWatchlist } from "@/lib/personal-store";
import { terminal } from "@/lib/terminal";

export const metadata = { title: "AI Analyst · ODDSIQ" };

const th = "px-2.5 py-2 font-medium";

function MarketList({ rows, now }: { rows: MarketRow[]; now: number }) {
  if (!rows.length) return <p className="px-4 py-3 text-sm text-muted">No open markets.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-[12.5px]">
        <thead>
          <tr className="border-b border-line text-[10.5px] uppercase tracking-wider text-muted">
            <th className={`${th} pl-4 text-left`}>Match</th>
            <th className={`${th} text-left`}>Selection</th>
            <th className={`${th} text-right`}>Odds (open → now)</th>
            <th className={`${th} text-right`}>Market</th>
            <th className={`${th} text-right`}>Model</th>
            <th className={`${th} pr-4 text-right`}>Difference</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.selectionId} className="border-b border-line/60">
              <td className="px-2.5 py-2 pl-4">
                <Link href={`/markets/${r.selectionId}`} className="hover:text-accent">
                  {r.match}
                </Link>
                <div className="text-[11px] text-muted">
                  {r.league} · {r.status === "live" ? `live ${r.minute}′` : fmtCountdown(r.kickoff - now)}
                </div>
              </td>
              <td className="px-2.5 py-2 text-ink-2">
                {r.market}: <span className="text-ink">{r.selection}</span>
              </td>
              <td className="num px-2.5 py-2 text-right">
                <span className="text-muted">{fmtOdds(r.openingOdds)} →</span> {fmtOdds(r.currentOdds)}
              </td>
              <td className="num px-2.5 py-2 text-right">{fmtPct(r.marketProbability)}</td>
              <td className="num px-2.5 py-2 text-right">{fmtPct(r.modelProbability)}</td>
              <td className="num px-2.5 py-2 pr-4 text-right">
                <Signed value={r.edgePp}>{fmtPp(r.edgePp)}</Signed>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function recordSentence(p: TeamRecord): string {
  if (p.n === 0) return `The ledger has no settled predictions on ${p.name} winning yet.`;
  return `On ${p.n} settled predictions of ${p.name} winning (since ${fmtDate(p.from)}), the model gave them ${fmtPct(p.meanPredicted)} on average and they won ${fmtPct(p.hitRate)} of the time. Brier ${p.brier.toFixed(3)} against the closing market's ${p.marketBrier.toFixed(3)}; average CLV ${fmtSignedPct(p.avgClv)}.${p.n < 30 ? " The sample is small, so treat these figures with caution." : ""}`;
}

function Form({ record }: { record: TeamRecord }) {
  return (
    <div className="flex gap-1">
      {record.form.map((f) => (
        <span
          key={f.eventId}
          title={`${fmtDate(f.kickoff)} ${f.home ? "vs" : "at"} ${f.opponent} ${f.score}`}
          className={`num inline-flex h-6 w-6 items-center justify-center rounded text-[11px] font-semibold ${f.result === "W" ? "bg-good/20 text-good" : f.result === "L" ? "bg-serious/20 text-serious" : "bg-surface-3 text-ink-2"}`}
        >
          {f.result}
        </span>
      ))}
    </div>
  );
}

export default async function AiAnalystPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const term = await terminal();
  const ctx = await term.personal();
  const now = term.now;
  const { q = "" } = await searchParams;
  const intent = parseQuestion(q, term.live ? ctx.teams : undefined);
  const watchlist = await readWatchlist();
  const rows = term.marketRows();
  const pre = rows.filter((r) => r.status === "scheduled" && r.edgePp !== null);

  let answer: React.ReactNode = null;
  if (intent?.kind === "team") {
    const rec = teamRecordOf(intent.teamId, ctx)!;
    const open = watchedRowsOf([{ kind: "team", id: intent.teamId }], ctx).sort((a, b) => a.kickoff - b.kickoff);
    const next = open[0];
    answer = (
      <Panel title={`${rec.name} · ${rec.leagueName}`} right={<WatchToggle kind="team" id={rec.id} label="Watch" watchlist={watchlist} />}>
        <div className="space-y-2 px-4 py-3 text-[13px] leading-relaxed">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted">Last {rec.form.length} results, newest first</span>
            <Form record={rec} />
          </div>
          <p>{recordSentence(rec)}</p>
          {next ? (
            <p>
              Next: {next.match}, {next.status === "live" ? `in play (${next.minute}′)` : fmtCountdown(next.kickoff - now)}. {open.length} open selections involve {rec.name}; the largest model-market difference among them is{" "}
              {(() => {
                const top = [...open].filter((r) => r.edgePp !== null).sort((a, b) => Math.abs(b.edgePp!) - Math.abs(a.edgePp!))[0];
                return top ? `${top.market}: ${top.selection} at ${fmtPp(top.edgePp)}.` : "not available.";
              })()}
            </p>
          ) : (
            <p>No open markets involve {rec.name} right now.</p>
          )}
        </div>
        <MarketList rows={open.slice(0, 9)} now={now} />
      </Panel>
    );
  } else if (intent?.kind === "compare") {
    const a = teamRecordOf(intent.a, ctx)!;
    const b = teamRecordOf(intent.b, ctx)!;
    const withB = watchedRowsOf([{ kind: "team", id: intent.b }], ctx);
    const shared = watchedRowsOf([{ kind: "team", id: intent.a }], ctx).filter((r) => withB.some((x) => x.eventId === r.eventId));
    const stat = (label: string, f: (x: TeamRecord) => string) => (
      <tr className="border-b border-line/60">
        <td className="num px-2.5 py-2 pl-4 text-right">{f(a)}</td>
        <td className="px-2.5 py-2 text-center text-xs text-muted">{label}</td>
        <td className="num px-2.5 py-2 pr-4">{f(b)}</td>
      </tr>
    );
    answer = (
      <Panel title={`${a.name} vs ${b.name}`} right="Historical · ledger and results">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-line text-[10.5px] uppercase tracking-wider text-muted">
              <th className={`${th} pl-4 text-right`}>{a.name}</th>
              <th className={th} />
              <th className={`${th} pr-4 text-left`}>{b.name}</th>
            </tr>
          </thead>
          <tbody>
            {stat("League", (x) => x.leagueName)}
            {stat("Recent form", (x) => x.form.map((f) => f.result).join(" ") || "—")}
            {stat("Settled predictions (win)", (x) => String(x.n))}
            {stat("Model gave them, avg", (x) => fmtPct(x.meanPredicted))}
            {stat("They won", (x) => fmtPct(x.hitRate))}
            {stat("Brier model / market", (x) => (x.n ? `${x.brier.toFixed(3)} / ${x.marketBrier.toFixed(3)}` : "—"))}
            {stat("Average CLV", (x) => fmtSignedPct(x.avgClv))}
          </tbody>
        </table>
        <div className="border-t border-line px-4 py-2 text-[13px]">
          {shared.length ? (
            <>
              <p className="mb-1 text-ink-2">They meet in an open market:</p>
              <MarketList rows={shared} now={now} />
            </>
          ) : (
            <p className="text-ink-2">They have no open market against each other. Sample sizes differ, so compare rates rather than counts.</p>
          )}
        </div>
      </Panel>
    );
  } else if (intent?.kind === "report" && reportWeeks(term.ledgerRows()).length === 0) {
    answer = (
      <Panel title="Weekly model report">
        <p className="px-4 py-3 text-[13px] text-ink-2">No ledger predictions have settled yet, so there is no weekly report to summarise.</p>
      </Panel>
    );
  } else if (intent?.kind === "report") {
    const lr = term.ledgerRows();
    const week = reportWeeks(lr)[0];
    const rep = weeklyReport(lr, week, rows);
    answer = (
      <Panel title={`Weekly model report · w/c ${fmtDate(week)}`}>
        <p className="px-4 py-3 text-[13px] leading-relaxed">{reportHeadline(rep)}</p>
        <ul className="list-disc space-y-1 pr-4 pb-3 pl-9 text-[13px] text-ink-2">
          {rep.findings.map((f, i) => (
            <li key={i}>{f.text}</li>
          ))}
        </ul>
        <p className="border-t border-line px-4 py-2 text-xs">
          <Link href="/model-lab/report" className="text-accent hover:underline">
            Open the full report →
          </Link>
        </p>
      </Panel>
    );
  } else if (intent?.kind === "watchlist") {
    const a = assistantAnswerOf("interesting", watchlist, await readThreshold(), ctx);
    answer = (
      <Panel title={a.question}>
        <div className="space-y-1.5 px-4 py-3 text-[13px]">
          {a.sentences.map((s) => (
            <p key={s}>{s}</p>
          ))}
        </div>
        <MarketList rows={a.rows} now={now} />
        <p className="border-t border-line px-4 py-2 text-xs">
          <Link href="/watchlist" className="text-accent hover:underline">
            Open your watchlist and My Market Assistant →
          </Link>
        </p>
      </Panel>
    );
  } else if (intent?.kind === "movers" || intent?.kind === "disagreement") {
    const list = [...pre].sort((a, b) => (intent.kind === "movers" ? Math.abs(b.movement) - Math.abs(a.movement) : Math.abs(b.edgePp!) - Math.abs(a.edgePp!))).slice(0, 8);
    const top = list[0];
    answer = (
      <Panel title={intent.kind === "movers" ? "Largest price moves since opening" : "Largest model-market differences"} right="Pre-match · live data">
        {top && (
          <p className="px-4 py-3 text-[13px] leading-relaxed">
            {intent.kind === "movers"
              ? `The largest move among ${pre.length} priced pre-match selections is ${top.match}, ${top.market}: ${top.selection}, from ${fmtOdds(top.openingOdds)} to ${fmtOdds(top.currentOdds)} (${fmtSignedPct(top.movement)}). The data shows the move, not its cause.`
              : `Across ${pre.length} priced pre-match selections, the largest difference is ${top.match}, ${top.market}: ${top.selection}, where the model says ${fmtPct(top.modelProbability)} and the margin-free market ${fmtPct(top.marketProbability)} (${fmtPp(top.edgePp)}, confidence ${top.confidence}). Large differences often come with wide uncertainty; this is a disagreement, not a recommendation.`}
          </p>
        )}
        <MarketList rows={list} now={now} />
      </Panel>
    );
  } else if (intent?.kind === "unknown") {
    answer = (
      <Panel title="I can't answer that from the terminal's data">
        <p className="px-4 py-3 text-[13px] text-ink-2">
          The analyst only answers from ODDSIQ&rsquo;s own data: teams and head-to-head comparisons, price moves, model-market differences, your watchlist and the weekly model report. Try one of the examples above.
        </p>
      </Panel>
    );
  }

  // Default feed: commentary on the three largest pre-match differences with reasonable confidence.
  const feed = [...pre]
    .filter((r) => (r.confidence ?? 0) >= 50)
    .sort((a, b) => Math.abs(b.edgePp!) - Math.abs(a.edgePp!))
    .filter((r, i, all) => all.findIndex((x) => x.eventId === r.eventId) === i)
    .slice(0, 3)
    .flatMap((r) => {
      const d = term.marketDetail(r.selectionId);
      return d ? [{ row: r, text: marketCommentary(d, now) }] : [];
    });

  return (
    <div className="space-y-4">
      <PageHeader
        title="AI Analyst"
        subtitle="Ask about a team, a comparison, price moves, model-market differences, your watchlist or the weekly model report. Answers use only ODDSIQ's own data and keep facts separate from possible explanations."
        right={<Badge>Rule-based · no language model connected</Badge>}
      />

      <Panel>
        <form action="/ai-analyst" className="flex gap-2 px-4 py-3">
          <input
            name="q"
            defaultValue={q}
            placeholder="e.g. compare Liverpool Chelsea"
            aria-label="Question"
            className="flex-1 rounded border border-line-strong bg-surface-2 px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent"
          />
          <button type="submit" className="rounded border border-line-strong px-3 py-2 text-sm hover:bg-surface-2">
            Ask
          </button>
        </form>
        <div className="flex flex-wrap gap-1.5 border-t border-line px-4 py-2">
          {ANALYST_EXAMPLES.map((e) => (
            <Link key={e} href={`/ai-analyst?q=${encodeURIComponent(e)}`} className="rounded bg-surface-2 px-2 py-1 text-xs text-ink-2 hover:text-ink">
              {e}
            </Link>
          ))}
        </div>
      </Panel>

      {answer}

      <div className="space-y-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-2">Market commentary</h2>
        <div className="grid gap-4 xl:grid-cols-3">
          {feed.map(({ row, text }) => (
            <Panel
              key={row.selectionId}
              title={row.match}
              right={
                <Link href={`/markets/${row.selectionId}`} className="text-accent hover:underline">
                  Open →
                </Link>
              }
            >
              <div className="space-y-2 px-4 py-3 text-[13px] leading-relaxed">
                <div className="text-xs text-muted">
                  {row.league} · {row.market}: {row.selection} · {fmtCountdown(row.kickoff - now)}
                </div>
                {text.map((t) => (
                  <p key={t}>{t}</p>
                ))}
              </div>
            </Panel>
          ))}
        </div>
        <p className="text-[11px] text-muted">
          The three largest pre-match model-market differences with confidence of 50 or more, one per match. Chosen by size of difference only. {COMMENTARY_NOTE} Live · {term.dataLabel}.
        </p>
      </div>
    </div>
  );
}
