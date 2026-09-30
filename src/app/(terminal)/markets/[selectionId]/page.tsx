import Link from "next/link";
import { notFound } from "next/navigation";
import { Ago } from "@/components/Clock";
import { ConsensusStrip } from "@/components/charts/ConsensusStrip";
import { InPlayChart } from "@/components/charts/InPlayChart";
import { ModelVsMarket } from "@/components/charts/ModelVsMarket";
import { OddsChart } from "@/components/charts/OddsChart";
import { TeamNewsPanel } from "@/components/TeamNewsPanel";
import { TrackPriceButton, WatchToggle } from "@/components/WatchButtons";
import { Badge, levelTone, Panel, Signed, Tip } from "@/components/ui";
import { COMMENTARY_NOTE, marketCommentary, whatChangedSummary } from "@/lib/demo/commentary";
import { MODEL_FAMILIES } from "@/lib/demo/models";
import { readWatchlist } from "@/lib/personal-store";
import { fmtCountdown, fmtDateTime, fmtOdds, fmtPct, fmtPp, fmtShortDateTime, fmtSignedPct, fmtTime } from "@/lib/format";
import { CONFIDENCE_DEFINITION } from "@/lib/metrics/consensus";
import { PRESSURE_DEFINITION } from "@/lib/metrics/movement";
import { DATA_QUALITY_DEFINITION } from "@/lib/metrics/quality";
import { marketRegime, REGIME_NOTE } from "@/lib/metrics/regime";
import { MOVEMENT_EXPLANATIONS, movementSignals, RLM_DEFINITION, SHARP_DEFINITION } from "@/lib/metrics/signals";
import { terminal } from "@/lib/terminal";

export const metadata = { title: "Market · ODDSIQ" };

const familyName = (versionId: string) => MODEL_FAMILIES.find((f) => versionId.startsWith(f.id))?.name ?? versionId;

export default async function MarketDetailPage({ params }: { params: Promise<{ selectionId: string }> }) {
  const t = await terminal();
  const now = t.now;
  const { selectionId } = await params;
  const d = t.marketDetail(selectionId);
  if (!d) notFound();
  const { row, event, analysis, prediction } = d;
  const selectionIsHome = selectionId.endsWith("-home");
  const signals = movementSignals(row);
  const watchlist = await readWatchlist();
  const commentary = marketCommentary(d, now);

  const priceAround = (at: number, deltaMin: number) => {
    const target = at + deltaMin * 60_000;
    let best = d.chart[0];
    for (const p of d.chart) if (Math.abs(p.at - target) < Math.abs(best.at - target)) best = p;
    return best?.consensus;
  };
  const whatChanged = [
    { at: d.chart[0]?.at, text: `Market opened at ${fmtOdds(d.chart[0]?.consensus)}` },
    ...d.news.map((n) => ({ at: n.at, text: n.text, move: [priceAround(n.at, -5), priceAround(n.at, 30)] as const })),
    { at: d.chart.at(-1)?.at, text: `${row.status === "scheduled" ? "Current" : "Closing"} consensus ${fmtOdds(d.chart.at(-1)?.consensus)}` },
  ].filter((x) => x.at !== undefined);

  const lastNews = d.news.filter((n) => n.at <= now).at(-1);
  const vols = t.marketRows().filter((r) => r.status === "scheduled").map((r) => r.volatility).sort((a, b) => a - b);
  const medianVol = vols[Math.floor(vols.length / 2)] ?? 0;
  const regime = marketRegime({
    live: row.status === "live",
    minutesToKickoff: (event.kickoff - now) / 60_000,
    lineupsConfirmed: event.lineupConfirmedAt !== undefined && event.lineupConfirmedAt <= now,
    minutesSinceNews: lastNews ? (now - lastNews.at) / 60_000 : null,
    moveSinceNews: lastNews ? row.currentOdds / (priceAround(lastNews.at, -5) ?? row.currentOdds) - 1 : 0,
    volatilityRatio: medianVol > 0 ? row.volatility / medianVol : 0,
    booksQuoting: row.booksQuoting,
    booksTracked: d.books.length,
  });

  // For in-play rows the ensemble is the pre-match model, so compare it with the pre-match closing market.
  const consensusMarket = row.inPlayModel ? (d.siblings.find((x) => x.selectionId === selectionId)?.marketProbability ?? row.marketProbability) : row.marketProbability;
  const components = analysis.components.map((c) => ({ label: familyName(c.modelVersionId), probability: c.probability, ciLow: c.ciLow, ciHigh: c.ciHigh, kind: "component" as const }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <Link href="/markets" className="hover:text-ink">
              Markets
            </Link>
            <span>/</span>
            <span>
              {event.sportName} · {event.leagueName}
            </span>
          </div>
          <h1 className="mt-1 text-xl font-semibold">
            {event.homeName} <span className="text-muted">vs</span> {event.awayName}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-ink-2">
            <span>
              {row.market} · <span className="text-ink">{row.selection}</span>
            </span>
            {event.status === "live" ? (
              <Badge tone="critical">
                ● Live {event.minute}′ · {event.score?.home}–{event.score?.away}
              </Badge>
            ) : event.status === "finished" ? (
              <Badge>
                Final {event.score?.home}–{event.score?.away}
              </Badge>
            ) : (
              <span className="text-xs text-muted">
                Kickoff {fmtDateTime(event.kickoff)} · {fmtCountdown(event.kickoff - now)}
              </span>
            )}
            {event.status !== "finished" && (
              <Tip text={`${REGIME_NOTE} ${regime.reason}`}>
                <Badge tone={regime.regime === "NORMAL" ? "neutral" : "accent"}>Regime: {regime.regime}</Badge>
              </Tip>
            )}
            {!t.live && <Badge tone="warning">Demo data</Badge>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <WatchToggle kind="market" id={selectionId} label="Market" watchlist={watchlist} />
            <WatchToggle kind="event" id={event.id} label="Match" watchlist={watchlist} />
            <WatchToggle kind="team" id={event.homeTeamId} label={event.homeName} watchlist={watchlist} />
            <WatchToggle kind="team" id={event.awayTeamId} label={event.awayName} watchlist={watchlist} />
            <WatchToggle kind="league" id={event.leagueId} label={event.leagueName} watchlist={watchlist} />
            {event.status === "scheduled" && <TrackPriceButton selectionId={selectionId} odds={fmtOdds(row.bestOdds)} />}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-6 text-right">
          <div>
            <div className="text-[10.5px] uppercase tracking-wider text-muted">Best odds</div>
            <div className="num text-2xl">{fmtOdds(row.bestOdds)}</div>
            <div className="text-[11px] text-muted">{row.bestBook}</div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-wider text-muted">Edge</div>
            <div className="text-2xl">
              <Signed value={row.edgePp}>{fmtPp(row.edgePp)}</Signed>
            </div>
            <div className="text-[11px] text-muted">model − market</div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-wider text-muted">EV</div>
            <div className="text-2xl">
              <Signed value={row.ev}>{fmtSignedPct(row.ev)}</Signed>
            </div>
            <div className="text-[11px] text-muted">at best odds</div>
          </div>
        </div>
      </div>

      {signals.map((sig) => (
        <div key={sig.kind} className="rounded-md border border-warning/40 bg-warning/5 px-4 py-3 text-sm">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-warning">
            <Tip text={sig.kind === "SHARP" ? SHARP_DEFINITION : RLM_DEFINITION}>{sig.kind === "SHARP" ? "⚡ Sharp movement" : "⇄ Reverse line movement"}</Tip>
          </div>
          <p className="mt-1 text-ink">{sig.summary}</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-ink-2">
            {sig.facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted">
            Possible explanations, not verified: {MOVEMENT_EXPLANATIONS.join(", ").toLowerCase()}. This describes price behaviour only; the data does not show who placed bets or why the price moved.
          </p>
        </div>
      ))}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Panel title="Market movement" right={row.status === "scheduled" ? <>Updated <Ago at={row.lastUpdate} /></> : "Pre-match market closed at kickoff"}>
            <OddsChart points={d.chart} markers={d.news.map((n) => ({ at: n.at, label: n.kind === "lineup" ? "Lineups" : n.kind === "return" ? "Return" : n.kind[0].toUpperCase() + n.kind.slice(1) }))} openingOdds={row.openingOdds} />
          </Panel>

          {d.inPlay && selectionIsHome && (
            <Panel title="Probability movement (in-play)" right="Model vs market, home win">
              <div className="px-4 py-3">
                <InPlayChart points={d.inPlay.minutes.map((m) => ({ minute: m.minute, model: m.model[0], market: m.market[0] }))} events={d.inPlay.timeline} />
                {d.inPlay.minutes.length > 1 && (
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                    {(["model", "market"] as const).map((k) => {
                      const pre = d.inPlay!.minutes[0][k][0];
                      const live = d.inPlay!.minutes.at(-1)![k][0];
                      return (
                        <div key={k} className="rounded border border-line px-3 py-2">
                          <div className="uppercase tracking-wider text-muted">{k === "model" ? "Model" : "Market implied"}</div>
                          <div className="num mt-1 text-ink">
                            {fmtPct(pre, 0)} → {fmtPct(live, 0)} <Signed value={live - pre}>{fmtPp((live - pre) * 100, 0)}</Signed>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Panel>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Model vs market">
              <ModelVsMarket market={row.marketProbability} model={row.modelProbability} ciLow={row.ciLow} ciHigh={row.ciHigh} />
            </Panel>
            <Panel title={row.inPlayModel ? "Model consensus (pre-match)" : "Model consensus"} right={prediction ? prediction.modelVersionId : row.inPlayModel ? "vs closing market" : "Not yet published"}>
              <ConsensusStrip
                market={consensusMarket}
                rows={[...components, { label: "Ensemble", probability: analysis.ensemble.probability, ciLow: analysis.ensemble.ciLow, ciHigh: analysis.ensemble.ciHigh, kind: "ensemble" }]}
              />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Why does the model differ?" right="Contribution to model − market at prediction time">
              <ol className="divide-y divide-line">
                {analysis.factors.map((f, i) => (
                  <li key={f.label} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                    <span className="flex items-baseline gap-2">
                      <span className="num text-xs text-muted">{i + 1}.</span>
                      <span>
                        {f.label}
                        <span className="block text-[11px] text-muted">{f.value}</span>
                      </span>
                    </span>
                    <Signed value={f.contributionPp}>{fmtPp(f.contributionPp)}</Signed>
                  </li>
                ))}
              </ol>
              <p className="border-t border-line px-4 py-2 text-[11px] text-muted">Factor contributions are model attributions, not proof of cause.</p>
            </Panel>
            <Panel title="What changed?" id="what-changed">
              <p className="border-b border-line px-4 py-2.5 text-[13px] leading-relaxed text-ink-2">{whatChangedSummary(d)}</p>
              <ol className="space-y-0 px-4 py-2">
                {whatChanged.map((w, i) => (
                  <li key={i} className="grid grid-cols-[92px_1fr] gap-3 border-l border-line py-1.5 pl-3 text-sm">
                    <span className="num text-xs text-muted">{fmtShortDateTime(w.at!)}</span>
                    <span>
                      {w.text}
                      {"move" in w && w.move && w.move[0] !== undefined && (
                        <span className="num ml-2 text-xs text-ink-2">
                          odds {fmtOdds(w.move[0])} → {fmtOdds(w.move[1])}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="border-t border-line px-4 py-2 text-[11px] text-muted">A timeline of recorded news and prices. Timing alone does not establish why a price moved.</p>
            </Panel>
          </div>

          {d.inPlay && (
            <Panel title="Event timeline">
              <ol className="max-h-64 divide-y divide-line overflow-y-auto">
                {[...d.inPlay.timeline].reverse().filter((e) => e.kind !== "corner" || d.inPlay!.timeline.length < 30).map((e, i) => (
                  <li key={i} className="flex items-center justify-between px-4 py-1.5 text-sm">
                    <span className="flex items-center gap-3">
                      <span className="num w-8 text-xs text-muted">{e.minute}′</span>
                      <span className={e.kind === "goal" ? "font-semibold" : "text-ink-2"}>{e.description}</span>
                    </span>
                    {e.modelBefore != null && (
                      <span className="num text-xs text-ink-2">
                        home win {fmtPct(e.modelBefore, 0)} → {fmtPct(e.modelAfter, 0)}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </Panel>
          )}

          {t.live && <TeamNewsPanel news={d.teamNews ?? null} home={event.homeName} away={event.awayName} />}
        </div>

        <div className="space-y-4">
          <Panel title="Market intelligence" right={<Badge>Templated</Badge>}>
            <div className="space-y-2 px-4 py-3 text-[13px] leading-relaxed">
              {commentary.map((c) => (
                <p key={c}>{c}</p>
              ))}
            </div>
            <p className="border-t border-line px-4 py-2 text-[11px] text-muted">{COMMENTARY_NOTE} {row.status === "scheduled" ? "Live" : "Pre-match close"} · {t.dataLabel}.</p>
          </Panel>
          <Panel title="Movement">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 px-4 py-3 text-sm">
              <dt className="text-muted">{row.inPlayModel ? "Price at kickoff" : "Opening"}</dt>
              <dd className="num text-right">{fmtOdds(row.openingOdds)}</dd>
              <dt className="text-muted">Current (consensus)</dt>
              <dd className="num text-right">{fmtOdds(row.currentOdds)}</dd>
              <dt className="text-muted">Change</dt>
              <dd className="num text-right">{fmtSignedPct(row.movement, 2)}</dd>
              <dt className="text-muted">Velocity (3h)</dt>
              <dd className="num text-right">
                {row.velocityPerHour >= 0 ? "+" : "−"}
                {Math.abs(row.velocityPerHour).toFixed(3)} odds/h
              </dd>
              <dt className="text-muted">Odds pressure</dt>
              <dd className="text-right">
                <Badge tone={levelTone(row.velocityLevel)}>{row.velocityLevel}</Badge>
              </dd>
              <dt className="text-muted">Books moving (6h)</dt>
              <dd className="num text-right">
                {row.booksMoving} / {row.booksQuoting}
              </dd>
            </dl>
          </Panel>

          <Panel title={<Tip text={PRESSURE_DEFINITION}>Estimated market pressure</Tip>}>
            <div className="px-4 py-3">
              <div className="flex items-baseline justify-between">
                <span className="num text-3xl">
                  {row.pressure.score}
                  <span className="text-base text-muted"> / 100</span>
                </span>
                <Badge tone={levelTone(row.pressure.level)}>{row.pressure.level}</Badge>
              </div>
              <ul className="mt-3 space-y-1.5">
                {row.pressure.components.map((c) => (
                  <li key={c.label} className="grid grid-cols-[1fr_80px_32px] items-center gap-2 text-xs text-ink-2">
                    <span>
                      {c.label} <span className="text-muted">({Math.round(c.weight * 100)}%)</span>
                    </span>
                    <span className="h-1.5 rounded-sm bg-surface-3">
                      <span className="block h-1.5 rounded-sm bg-accent" style={{ width: `${c.value * 100}%` }} />
                    </span>
                    <span className="num text-right">{Math.round(c.value * 100)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-muted">No betting-volume or liquidity data is available from this feed, so this score is estimated from price behaviour only.</p>
            </div>
          </Panel>

          <Panel title={<Tip text={CONFIDENCE_DEFINITION}>Prediction record</Tip>}>
            {prediction ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 text-sm">
                <dt className="text-muted">Recorded</dt>
                <dd className="num text-right text-xs">{fmtDateTime(prediction.createdAt)}</dd>
                <dt className="text-muted">Model version</dt>
                <dd className="num text-right text-xs">{prediction.modelVersionId}</dd>
                <dt className="text-muted">Probability</dt>
                <dd className="num text-right">
                  {fmtPct(prediction.probability)} <span className="text-xs text-muted">({fmtPct(prediction.ciLow, 0)}–{fmtPct(prediction.ciHigh, 0)})</span>
                </dd>
                <dt className="text-muted">Odds at prediction</dt>
                <dd className="num text-right">{fmtOdds(prediction.odds)}</dd>
                <dt className="text-muted">Confidence</dt>
                <dd className="num text-right">{prediction.confidence}</dd>
                <dt className="text-muted">Ledger #</dt>
                <dd className="num text-right text-xs">
                  <Link href={`/model-lab/ledger?q=${encodeURIComponent(prediction.id)}`} className="text-accent hover:underline">
                    {prediction.seq}
                  </Link>
                </dd>
                <dt className="text-muted">Hash</dt>
                <dd className="num truncate text-right text-[11px] text-muted" title={prediction.hash}>
                  {prediction.hash.slice(0, 16)}…
                </dd>
              </dl>
            ) : (
              <p className="px-4 py-3 text-sm text-ink-2">
                {row.inPlayModel ? "In-play estimates are not recorded in the ledger. Only pre-match predictions are ledgered." : "The model has not published a prediction for this market yet."}
              </p>
            )}
          </Panel>

          <Panel title={<Tip text={DATA_QUALITY_DEFINITION}>Data quality</Tip>} right={<span className="num text-ink">{row.dataQuality.score} / 100</span>}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 px-4 py-3 text-sm">
              <dt className="text-muted">Odds</dt>
              <dd className="text-right">{row.dataQuality.odds}</dd>
              <dt className="text-muted">Statistics</dt>
              <dd className="text-right">{row.dataQuality.statistics}</dd>
              <dt className="text-muted">Lineup</dt>
              <dd className="text-right">{row.dataQuality.lineup}</dd>
              <dt className="text-muted">Injuries</dt>
              <dd className="text-right">{row.dataQuality.injuries}</dd>
              <dt className="text-muted">Book coverage</dt>
              <dd className="num text-right">{fmtPct(row.dataQuality.completeness, 0)}</dd>
            </dl>
            <div className="border-t border-line px-4 py-2.5">
              <div className="mb-1.5 text-[10.5px] uppercase tracking-wider text-muted">Sources</div>
              <ul className="space-y-1 text-xs">
                {t.dataSources().map((s) => (
                  <li key={s.id} className="flex justify-between gap-2 text-ink-2">
                    <span>
                      <span className="text-good">●</span> {s.name}
                    </span>
                    <span className="num text-muted">{fmtTime(s.lastSyncAt, true)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>

          <Panel title="Bookmakers" right={`${d.books.length} quoting`}>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted">
                  <th className="px-4 py-1.5 text-left font-medium">Book</th>
                  <th className="px-2 py-1.5 text-right font-medium">Open</th>
                  <th className="px-2 py-1.5 text-right font-medium">{t.live ? "Previous run" : "1h ago"}</th>
                  <th className="px-4 py-1.5 text-right font-medium">Now</th>
                </tr>
              </thead>
              <tbody>
                {[...d.books].sort((a, b) => b.odds - a.odds).map((b) => (
                  <tr key={b.id} className="border-t border-line/60">
                    <td className="px-4 py-1.5 text-ink-2">{b.name}</td>
                    <td className="num px-2 py-1.5 text-right text-muted">{fmtOdds(b.open)}</td>
                    <td className="num px-2 py-1.5 text-right text-muted">{fmtOdds(b.oneHourAgo)}</td>
                    <td className="num px-4 py-1.5 text-right">{fmtOdds(b.odds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-line px-4 py-2 text-[11px] text-muted">{t.live ? "Prices from The Odds API. Columns show each bookmaker at opening, at the previous feed run and now." : "Bookmaker names are fictional (demo feed)."}</p>
          </Panel>

          <Panel title="Other selections">
            <ul className="divide-y divide-line">
              {d.siblings.map((s) => (
                <li key={s.selectionId}>
                  <Link href={`/markets/${s.selectionId}`} className={`flex justify-between px-4 py-2 text-sm hover:bg-surface-2 ${s.selectionId === selectionId ? "text-accent" : ""}`}>
                    <span>{s.name}</span>
                    <span className="num text-xs text-ink-2">
                      mkt {fmtPct(s.marketProbability)} · model {fmtPct(s.modelProbability)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
