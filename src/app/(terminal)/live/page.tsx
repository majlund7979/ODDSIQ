import Link from "next/link";
import { AutoRefresh } from "@/components/AutoRefresh";
import { MinuteChart } from "@/components/charts/MinuteChart";
import { Badge, LinkTabs, PageHeader, Panel, Signed, Tip } from "@/components/ui";
import { DEMO_MODE, requestNow } from "@/lib/data";
import { DemoOnly } from "@/components/DemoOnly";
import { INTELLIGENCE_NOTE, marketIntelligence } from "@/lib/demo/intelligence";
import { inPlayOdds, marketRows, matchView, replayableEvents } from "@/lib/demo/store";
import { fmtCountdown, fmtOdds, fmtPct, fmtPp, fmtTime } from "@/lib/format";
import { marketRegime, REGIME_NOTE } from "@/lib/metrics/regime";

export const metadata = { title: "Live Markets · ODDSIQ" };

const STAT_KINDS = [
  { kind: "goal", label: "Goals" },
  { kind: "shot", label: "Shots" },
  { kind: "corner", label: "Corners" },
  { kind: "yellow", label: "Yellow cards" },
  { kind: "red", label: "Red cards" },
  { kind: "substitution", label: "Substitutions" },
] as const;

const ODDS_CAP = 15;

const KIND_MARK: Record<string, string> = { goal: "⚽", red: "■", yellow: "▪", substitution: "⇄", shot: "◦", corner: "⌐", var: "▣" };

export default async function LivePage({ searchParams }: { searchParams: Promise<{ event?: string; sel?: string }> }) {
  if (!DEMO_MODE) return <DemoOnly title="Live Terminal" needs="in-play scores, match events and in-play prices" />;
  const now = await requestNow();
  const q = await searchParams;
  const rows = marketRows(now);

  const firstRowPerEvent = (list: typeof rows) => [...new Map(list.map((r) => [r.eventId, r])).values()];
  const live = firstRowPerEvent(rows.filter((r) => r.status === "live"));
  const soon = firstRowPerEvent(rows.filter((r) => r.status === "scheduled" && r.kickoff - now <= 3 * 3_600_000)).sort((a, b) => a.kickoff - b.kickoff);
  const finished = replayableEvents(now).filter((e) => e.kickoff > now - 8 * 3_600_000).slice(0, 5);

  const eventId = live.some((r) => r.eventId === q.event) ? q.event! : live[0]?.eventId;
  const view = eventId ? matchView(eventId, now) : undefined;
  const sel = Math.min(Math.max(Number(q.sel) || 0, 0), (view?.selections.length ?? 1) - 1);
  const regime = marketRegime({ live: true, minutesToKickoff: 0, lineupsConfirmed: true, minutesSinceNews: null, moveSinceNews: 0, volatilityRatio: 0, booksQuoting: 0, booksTracked: 0 });
  const intel = view ? marketIntelligence(view, sel, regime) : null;
  const first = view?.minutes[0];
  const last = view?.minutes.at(-1);
  const series = (key: "market" | "model", i: number) => view!.minutes.map((m) => ({ minute: m.minute, v: m[key][i] }));

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={30} />
      <PageHeader
        title="Live Markets"
        subtitle="Live matches on the left, the selected market in the centre, and a plain summary of what the data shows on the right. The page refreshes itself every 30 seconds."
        right={<span className="text-xs text-muted">{live.length} live · DEMO DATA</span>}
      />

      <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)_300px]">
        {/* Left: match list */}
        <div className="space-y-4">
          <Panel title="Live now">
            {live.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">No matches in play right now.</p>
            ) : (
              <ul className="divide-y divide-line">
                {live.map((r) => (
                  <li key={r.eventId}>
                    <Link
                      href={`/live?event=${r.eventId}`}
                      scroll={false}
                      aria-current={r.eventId === eventId ? "page" : undefined}
                      className={`block px-4 py-2.5 hover:bg-surface-2 ${r.eventId === eventId ? "bg-surface-2" : ""}`}
                    >
                      <div className="flex items-center justify-between text-[11px] text-muted">
                        <span className="truncate">{r.league}</span>
                        <span className="num text-good">{r.minute}′</span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2 text-sm">
                        <span className="truncate">{r.match}</span>
                        <span className="num shrink-0 font-semibold">
                          {r.score?.home}–{r.score?.away}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Starting soon" right="Next 3 hours">
            {soon.length === 0 ? (
              <p className="px-4 py-4 text-center text-xs text-muted">Nothing kicks off in the next 3 hours.</p>
            ) : (
              <ul className="divide-y divide-line">
                {soon.slice(0, 8).map((r) => (
                  <li key={r.eventId}>
                    <Link href={`/markets/${r.selectionId}`} className="block px-4 py-2 hover:bg-surface-2">
                      <div className="flex justify-between text-[11px] text-muted">
                        <span className="truncate">
                          {r.sport} · {r.league}
                        </span>
                        <span className="num shrink-0">{fmtCountdown(r.kickoff - now)}</span>
                      </div>
                      <div className="truncate text-[13px]">{r.match}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {finished.length > 0 && (
            <Panel title="Just finished">
              <ul className="divide-y divide-line">
                {finished.map((e) => (
                  <li key={e.id}>
                    <Link href={`/market-replay?event=${e.id}`} className="flex items-center justify-between gap-2 px-4 py-2 text-[13px] hover:bg-surface-2">
                      <span className="truncate">
                        {e.homeName} {e.score?.home}–{e.score?.away} {e.awayName}
                      </span>
                      <span className="shrink-0 text-[11px] text-accent">Replay →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        {/* Centre: selected market */}
        <div className="min-w-0 space-y-4">
          {!view || !first || !last ? (
            <Panel>
              <p className="px-4 py-10 text-center text-sm text-muted">No live match selected. Matches appear here when they kick off; until then, use Starting soon or replay a finished match.</p>
            </Panel>
          ) : (
            <>
              <Panel>
                <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3">
                  <div>
                    <div className="text-xs text-muted">
                      {view.event.sportName} · {view.event.leagueName} · kickoff {fmtTime(view.event.kickoff)} UTC
                    </div>
                    <div className="mt-1 flex items-baseline gap-3 text-xl font-semibold">
                      <span>{view.event.homeName}</span>
                      <span className="num">
                        {last.score.home}–{last.score.away}
                      </span>
                      <span>{view.event.awayName}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className="num text-lg text-good">{last.minute}′</span>
                    <span className="flex gap-2">
                      <Badge tone="accent">
                        <Tip text={`${REGIME_NOTE} ${regime.reason}`}>Regime: {regime.regime}</Tip>
                      </Badge>
                      <Badge>In-play model</Badge>
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2">
                  <LinkTabs label="Selection" active={String(sel)} items={view.selections.map((s, i) => ({ id: String(i), label: `${view.marketName}: ${s.name}`, href: `/live?event=${eventId}&sel=${i}` }))} />
                  <span className="flex gap-3 text-xs">
                    <Link href={`/markets/${view.selections[sel].id}#what-changed`} className="text-accent hover:underline">
                      What changed? →
                    </Link>
                    <Link href={`/markets/${view.selections[sel].id}`} className="text-accent hover:underline">
                      Full market →
                    </Link>
                  </span>
                </div>
              </Panel>

              <Panel title={`Probability · ${view.selections[sel].name}`} right="Live · margin-free market and in-play model">
                <div className="px-3 py-2">
                  <MinuteChart
                    label={`In-play probability for ${view.selections[sel].name}`}
                    format={(v) => fmtPct(v, 0)}
                    events={view.timeline}
                    series={[
                      { label: "Market implied", color: "var(--series-market)", points: series("market", sel) },
                      { label: "Model", color: "var(--series-model)", points: series("model", sel) },
                      { label: "Market at kickoff", color: "var(--muted)", dashed: true, points: [{ minute: 0, v: first.market[sel] }, { minute: last.minute, v: first.market[sel] }] },
                    ]}
                  />
                </div>
              </Panel>

              <Panel title={`Odds · ${view.selections[sel].name}`} right={`Live · 5% margin assumed · capped at ${ODDS_CAP}`}>
                <div className="px-3 py-2">
                  <MinuteChart
                    label={`In-play odds for ${view.selections[sel].name}`}
                    format={(v) => v.toFixed(2)}
                    events={view.timeline}
                    height={150}
                    domain={[1, Math.min(ODDS_CAP, Math.max(...view.minutes.map((m) => inPlayOdds(m.market[sel], 0.05)), view.closingOdds[sel])) * 1.08]}
                    series={[
                      { label: "In-play odds", color: "var(--series-market)", points: view.minutes.map((m) => ({ minute: m.minute, v: Math.min(ODDS_CAP, inPlayOdds(m.market[sel], 0.05)) })) },
                      { label: "Pre-match closing odds", color: "var(--muted)", dashed: true, points: [{ minute: 0, v: view.closingOdds[sel] }, { minute: last.minute, v: view.closingOdds[sel] }] },
                    ]}
                  />
                </div>
              </Panel>

              <Panel title="Probability movement" right="Kickoff → now, percentage points">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-[12.5px]">
                    <thead>
                      <tr className="border-b border-line text-[10.5px] uppercase tracking-wider text-muted">
                        <th className="px-2.5 py-2 pl-4 text-left font-medium">Selection</th>
                        <th className="px-2.5 py-2 text-right font-medium">Market 0′</th>
                        <th className="px-2.5 py-2 text-right font-medium">Market now</th>
                        <th className="px-2.5 py-2 text-right font-medium">Δ</th>
                        <th className="px-2.5 py-2 text-right font-medium">Model 0′</th>
                        <th className="px-2.5 py-2 text-right font-medium">Model now</th>
                        <th className="px-2.5 py-2 pr-4 text-right font-medium">Δ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {view.selections.map((s, i) => {
                        const dm = (last.market[i] - first.market[i]) * 100;
                        const dmo = (last.model[i] - first.model[i]) * 100;
                        return (
                          <tr key={s.id} className={`border-b border-line/60 ${i === sel ? "bg-surface-2" : ""}`}>
                            <td className="px-2.5 py-2 pl-4">{s.name}</td>
                            <td className="num px-2.5 py-2 text-right text-ink-2">{fmtPct(first.market[i])}</td>
                            <td className="num px-2.5 py-2 text-right">{fmtPct(last.market[i])}</td>
                            <td className="num px-2.5 py-2 text-right whitespace-nowrap">
                              <Signed value={dm}>{fmtPp(dm)}</Signed>
                            </td>
                            <td className="num px-2.5 py-2 text-right text-ink-2">{fmtPct(first.model[i])}</td>
                            <td className="num px-2.5 py-2 text-right">{fmtPct(last.model[i])}</td>
                            <td className="num px-2.5 py-2 pr-4 text-right whitespace-nowrap">
                              <Signed value={dmo}>{fmtPp(dmo)}</Signed>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
                  Live · market is margin-free; in play the model is re-estimated each minute from score, time and red cards.
                  {view.modelVersion ? ` Pre-match ledgered prediction (${view.modelVersion}): ${view.preMatchModel.map((p, i) => `${view.selections[i].name} ${fmtPct(p)}`).join(", ")}.` : " No pre-match prediction was ledgered for this market."}
                </p>
              </Panel>

              <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
                <Panel title="Live statistics" right="From the event feed">
                  <table className="w-full text-[12.5px]">
                    <thead>
                      <tr className="border-b border-line text-[10.5px] uppercase tracking-wider text-muted">
                        <th className="px-2.5 py-2 pl-4 text-right font-medium">{view.event.homeName}</th>
                        <th className="px-2.5 py-2 text-center font-medium" />
                        <th className="px-2.5 py-2 pr-4 text-left font-medium">{view.event.awayName}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {STAT_KINDS.map((k) => {
                        const n = (team: "home" | "away") => view.timeline.filter((e) => e.kind === k.kind && e.team === team).length;
                        return (
                          <tr key={k.kind} className="border-b border-line/60">
                            <td className="num px-2.5 py-1.5 pl-4 text-right">{n("home")}</td>
                            <td className="px-2.5 py-1.5 text-center text-xs text-muted">{k.label}</td>
                            <td className="num px-2.5 py-1.5 pr-4">{n("away")}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </Panel>

              <Panel title="Event timeline" right="Newest first · model home-win change">
                <ul className="max-h-80 divide-y divide-line overflow-y-auto">
                  {[...view.timeline].reverse().map((e, i) => (
                    <li key={i} className="grid grid-cols-[44px_20px_1fr_auto] items-center gap-2 px-4 py-1.5 text-[13px]">
                      <span className="num text-ink-2">{e.minute}′</span>
                      <span className={e.kind === "red" ? "text-critical" : e.kind === "goal" ? "text-warning" : "text-muted"}>{KIND_MARK[e.kind] ?? "·"}</span>
                      <span className={e.kind === "goal" || e.kind === "red" ? "" : "text-ink-2"}>{e.description}</span>
                      <span className="num text-xs text-muted">{e.modelBefore != null && e.modelAfter != null ? `${fmtPct(e.modelBefore, 0)} → ${fmtPct(e.modelAfter, 0)}` : ""}</span>
                    </li>
                  ))}
                  <li className="grid grid-cols-[44px_20px_1fr_auto] gap-2 px-4 py-1.5 text-[13px] text-muted">
                    <span className="num">0′</span>
                    <span>▸</span>
                    <span>Kickoff. Closing odds {view.selections.map((s, i) => `${s.name} ${fmtOdds(view.closingOdds[i])}`).join(" · ")}</span>
                    <span />
                  </li>
                </ul>
              </Panel>
              </div>
            </>
          )}
        </div>

        {/* Right: market intelligence */}
        <div className="space-y-4">
          <Panel title="Market Intelligence" right={<Badge>Templated</Badge>}>
            {!intel ? (
              <p className="px-4 py-6 text-sm text-muted">Select a live match.</p>
            ) : (
              <div className="space-y-3 px-4 py-3 text-[13px] leading-relaxed">
                <div>
                  <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted">What the data shows</div>
                  <ul className="list-disc space-y-1.5 pl-4 text-ink">
                    {intel.facts.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
                {intel.possible.length > 0 && (
                  <div>
                    <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted">Possible explanations for price moves</div>
                    <ul className="list-disc space-y-1.5 pl-4 text-ink-2">
                      {intel.possible.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                    <p className="mt-1.5 text-[11px] text-muted">These are general possibilities. The data cannot show which one applied.</p>
                  </div>
                )}
              </div>
            )}
            <p className="border-t border-line px-4 py-2 text-[11px] text-muted">{INTELLIGENCE_NOTE} Live · DEMO DATA.</p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
