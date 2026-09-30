import Link from "next/link";
import { setThreshold } from "@/app/actions";
import { WatchToggle } from "@/components/WatchButtons";
import { PageHeader, Panel, Signed } from "@/components/ui";
import { ASSISTANT_QUESTIONS, assistantAnswerOf, matchAssistantQuestion, modelRecordOf, resolveWatchItemOf, WATCH_KINDS, watchedRowsOf, type AssistantQuestion } from "@/lib/demo/personal";
import { fmtCountdown, fmtOdds, fmtPp, fmtSignedPct } from "@/lib/format";
import { readThreshold, readWatchlist } from "@/lib/personal-store";
import { terminal } from "@/lib/terminal";

export const metadata = { title: "Watchlist · ODDSIQ" };

const th = "px-2.5 py-2 font-medium";

export default async function WatchlistPage({ searchParams }: { searchParams: Promise<{ ask?: string; text?: string }> }) {
  const t = await terminal();
  const ctx = await t.personal();
  const now = t.now;
  const q = await searchParams;
  const items = await readWatchlist();
  const threshold = await readThreshold();
  const resolved = items.map((i) => resolveWatchItemOf(i, ctx)).filter((x) => x !== null);
  const rows = watchedRowsOf(items, ctx);
  const open = [...new Map(rows.map((r) => [r.eventId, r])).values()].sort((a, b) => (a.status === "live" ? -1 : 0) - (b.status === "live" ? -1 : 0) || a.kickoff - b.kickoff);
  const ask: AssistantQuestion | null = ASSISTANT_QUESTIONS.some((x) => x.id === q.ask) ? (q.ask as AssistantQuestion) : q.text ? matchAssistantQuestion(q.text) : null;
  const answer = ask ? assistantAnswerOf(ask, items, threshold, ctx) : null;
  const models = items.filter((i) => i.kind === "model").map((i) => modelRecordOf(i.id, ctx));

  return (
    <div className="space-y-4">
      <PageHeader
        title="My Watchlist"
        subtitle="Teams, leagues, matches, markets and models you follow, with My Market Assistant to summarise them. Use the ☆ buttons on any market page or type /watch Arsenal in the command bar (⌘K)."
        right={<span className="text-xs text-muted">Saved in this browser until accounts arrive</span>}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <Panel title="My Market Assistant" right="Summarises your watchlist; decides nothing">
            <div className="flex flex-wrap gap-1.5 px-4 pt-3">
              {ASSISTANT_QUESTIONS.map((x) => (
                <Link key={x.id} href={`/watchlist?ask=${x.id}`} scroll={false} aria-current={ask === x.id ? "true" : undefined} className={`rounded px-2 py-1 text-xs ${ask === x.id ? "bg-surface-3 text-ink" : "bg-surface-2 text-ink-2 hover:text-ink"}`}>
                  {x.label}
                </Link>
              ))}
            </div>
            <form action="/watchlist" className="flex gap-2 px-4 py-3">
              <input name="text" defaultValue={q.text ?? ""} placeholder="Ask about your watchlist…" aria-label="Ask the assistant" className="flex-1 rounded border border-line-strong bg-surface-2 px-3 py-1.5 text-sm outline-none placeholder:text-muted focus:border-accent" />
              <button type="submit" className="rounded border border-line-strong px-3 py-1.5 text-sm hover:bg-surface-2">
                Ask
              </button>
            </form>
            {q.text && !ask && <p className="border-t border-line px-4 py-3 text-[13px] text-ink-2">I can only answer the questions above about your watchlist. For anything else, try the AI Analyst.</p>}
            {answer && (
              <div className="border-t border-line">
                <div className="space-y-1.5 px-4 py-3 text-[13px] leading-relaxed">
                  <p className="text-xs text-muted">{answer.question}</p>
                  {answer.sentences.map((s) => (
                    <p key={s}>{s}</p>
                  ))}
                </div>
                {answer.rows.length > 0 && (
                  <ul className="divide-y divide-line border-t border-line">
                    {answer.rows.map((r) => (
                      <li key={r.selectionId}>
                        <Link href={r.status === "live" ? `/live?event=${r.eventId}` : `/markets/${r.selectionId}`} className="flex items-center justify-between gap-3 px-4 py-2 text-[13px] hover:bg-surface-2">
                          <span className="min-w-0 truncate">
                            {r.match} <span className="text-ink-2">· {r.market}: {r.selection}</span> <span className="text-[11px] text-muted">· {r.status === "live" ? `live ${r.minute}′` : fmtCountdown(r.kickoff - now)}</span>
                          </span>
                          <span className="num shrink-0 text-xs text-ink-2">
                            {fmtOdds(r.currentOdds)} · <Signed value={r.edgePp}>{fmtPp(r.edgePp)}</Signed>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <form action={setThreshold} className="flex items-center gap-2 border-t border-line px-4 py-2 text-xs text-muted">
              <label htmlFor="threshold">Saved threshold for model-market differences</label>
              <input id="threshold" name="threshold" type="number" min={1} max={30} defaultValue={threshold} className="num w-14 rounded border border-line-strong bg-surface-2 px-1.5 py-0.5 text-ink" />
              <span>pp</span>
              <button type="submit" className="rounded border border-line-strong px-2 py-0.5 hover:text-ink">
                Save
              </button>
            </form>
          </Panel>

          <Panel title="Matches from my watchlist" right={`${open.length} open`}>
            {open.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">{items.length ? "No open matches involve your watchlist right now." : "Your watchlist is empty. Add a team or league on the right to get started."}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-[12.5px]">
                  <thead>
                    <tr className="border-b border-line text-[10.5px] uppercase tracking-wider text-muted">
                      <th className={`${th} pl-4 text-left`}>Match</th>
                      <th className={`${th} text-left`}>Status</th>
                      <th className={`${th} text-right`}>Largest difference</th>
                      <th className={`${th} pr-4 text-right`}>Largest move</th>
                    </tr>
                  </thead>
                  <tbody>
                    {open.slice(0, 40).map((e) => {
                      const sel = rows.filter((r) => r.eventId === e.eventId);
                      const edge = [...sel].filter((r) => r.edgePp !== null).sort((a, b) => Math.abs(b.edgePp!) - Math.abs(a.edgePp!))[0];
                      const move = [...sel].sort((a, b) => Math.abs(b.movement) - Math.abs(a.movement))[0];
                      return (
                        <tr key={e.eventId} className="border-b border-line/60">
                          <td className="px-2.5 py-2 pl-4">
                            <Link href={e.status === "live" ? `/live?event=${e.eventId}` : `/markets/${e.selectionId}`} className="hover:text-accent">
                              {e.match}
                            </Link>
                            <div className="text-[11px] text-muted">
                              {e.sport} · {e.league}
                            </div>
                          </td>
                          <td className="num px-2.5 py-2 text-ink-2">{e.status === "live" ? <span className="text-good">live {e.minute}′ · {e.score?.home}–{e.score?.away}</span> : fmtCountdown(e.kickoff - now)}</td>
                          <td className="num px-2.5 py-2 text-right">
                            {edge ? (
                              <>
                                <span className="text-ink-2">{edge.selection}</span> <Signed value={edge.edgePp}>{fmtPp(edge.edgePp)}</Signed>
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="num px-2.5 py-2 pr-4 text-right">
                            <span className="text-ink-2">{move.selection}</span> <Signed value={-move.movement}>{fmtSignedPct(move.movement)}</Signed>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="border-t border-line px-4 py-2 text-[11px] text-muted">Live · difference is model minus margin-free market probability (in play: in-play model); move is consensus price change since opening. {t.dataLabel}.</p>
          </Panel>

          {models.length > 0 && (
            <Panel title="Tracked models" right="Historical · last 28 days, settled">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-line text-[10.5px] uppercase tracking-wider text-muted">
                    <th className={`${th} pl-4 text-left`}>Model</th>
                    <th className={`${th} text-right`}>n</th>
                    <th className={`${th} text-right`}>Brier model / market</th>
                    <th className={`${th} pr-4 text-right`}>Avg CLV</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((m) => (
                    <tr key={m.versionId} className="border-b border-line/60">
                      <td className="px-2.5 py-2 pl-4">{m.versionId}</td>
                      <td className="num px-2.5 py-2 text-right">{m.n}</td>
                      <td className="num px-2.5 py-2 text-right">{m.n ? `${m.brier.toFixed(3)} / ${m.marketBrier.toFixed(3)}` : "—"}</td>
                      <td className="num px-2.5 py-2 pr-4 text-right">{m.clvN ? fmtSignedPct(m.avgClv) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-line px-4 py-2 text-[11px] text-muted">A retired version shows n = 0 once it no longer records predictions.</p>
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          <Panel title="Watching" right={`${resolved.length} ${resolved.length === 1 ? "item" : "items"}`}>
            {resolved.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted">Nothing yet.</p>
            ) : (
              WATCH_KINDS.filter((k) => resolved.some((r) => r.kind === k.kind)).map((k) => (
                <div key={k.kind} className="border-b border-line last:border-0">
                  <div className="px-4 pt-2 text-[10.5px] uppercase tracking-wider text-muted">{k.label}</div>
                  <ul>
                    {resolved
                      .filter((r) => r.kind === k.kind)
                      .map((r) => (
                        <li key={r.id} className="flex items-center justify-between gap-2 px-4 py-1.5 text-[13px]">
                          <Link href={r.href} className="min-w-0 truncate hover:text-accent">
                            {r.label} <span className="text-[11px] text-muted">{r.detail}</span>
                          </Link>
                          <WatchToggle kind={r.kind} id={r.id} label="Remove" watchlist={items} />
                        </li>
                      ))}
                  </ul>
                </div>
              ))
            )}
          </Panel>

          <Panel title="Add leagues">
            <div className="flex flex-wrap gap-1.5 px-4 py-3">
              {ctx.leagues.map((l) => (
                <WatchToggle key={l.id} kind="league" id={l.id} label={l.name} watchlist={items} />
              ))}
            </div>
          </Panel>
          <Panel title="Add models">
            <div className="flex flex-wrap gap-1.5 px-4 py-3">
              {ctx.models.map((m) => (
                <WatchToggle key={m.id} kind="model" id={m.id} label={m.id} watchlist={items} />
              ))}
            </div>
            <p className="border-t border-line px-4 py-2 text-[11px] text-muted">Add teams with /watch in the command bar, from a team&rsquo;s AI Analyst page, or from any market page.</p>
          </Panel>
          <p className="text-[11px] text-muted">The assistant answers a fixed set of questions from the data behind this page. It never places, suggests or sizes bets.</p>
        </div>
      </div>
    </div>
  );
}
