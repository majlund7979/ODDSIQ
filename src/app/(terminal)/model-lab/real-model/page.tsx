import { CalibrationChart } from "@/components/charts/CalibrationChart";
import { Badge, PageHeader, Panel, Signed, Tip } from "@/components/ui";
import { wallClock } from "@/lib/data";
import { db, DATABASE_CONFIGURED } from "@/lib/db";
import { fmtInt, fmtPct, fmtPeriod, fmtPp, fmtShortDateTime, fmtSignedPct } from "@/lib/format";
import { MIN_SAMPLE_FOR_WARNING } from "@/lib/metrics/metric";
import type { ModelScore } from "@/lib/model/backtest";
import { REAL_MODEL, UNCERTAINTY_NOTE } from "@/lib/model/ensemble";
import { livePredictions, snapshotBacktest, storedBacktests, type BacktestView } from "@/lib/model/overview";
import { PREDICTION_LEAD_MS } from "@/lib/model/pipeline";

export const metadata = { title: "Real Model · ODDSIQ" };

const f3 = (x: number | null | undefined) => (x == null || Number.isNaN(x) ? "—" : x.toFixed(3));
const better = (model: number, base: number) => (base - model) / base;

function ScoreRow({ label, s, base, strong }: { label: string; s: ModelScore; base?: ModelScore; strong?: boolean }) {
  return (
    <tr className={strong ? "font-medium" : "text-ink-2"}>
      <td className="px-4 py-1.5">{label}</td>
      <td className="num px-2 py-1.5 text-right">{f3(s.logLoss)}</td>
      <td className="num px-2 py-1.5 text-right">{f3(s.rps)}</td>
      <td className="num px-2 py-1.5 text-right">{f3(s.brier)}</td>
      <td className="num px-4 py-1.5 text-right">{base ? <Signed value={better(s.logLoss, base.logLoss)}>{fmtSignedPct(better(s.logLoss, base.logLoss))}</Signed> : "—"}</td>
    </tr>
  );
}

function Backtest({ b }: { b: BacktestView }) {
  const base = b.scores.baseRate;
  return (
    <Panel title={`Backtest · ${b.leagueName}`} right={<span className="text-xs text-muted">Historical · walk-forward</span>}>
      <div className="grid gap-0 lg:grid-cols-[1fr_300px]">
        <div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-line">
                <th className="px-4 py-2 font-normal">Match result (1X2)</th>
                <th className="px-2 py-2 text-right font-normal">
                  <Tip text="Mean negative log-likelihood of the actual result. Lower is better.">Log loss</Tip>
                </th>
                <th className="px-2 py-2 text-right font-normal">
                  <Tip text="Ranked probability score: rewards putting probability near the actual result on the home–draw–away scale. Lower is better.">RPS</Tip>
                </th>
                <th className="px-2 py-2 text-right font-normal">
                  <Tip text="Multi-outcome Brier score (sum over home, draw, away). Lower is better.">Brier</Tip>
                </th>
                <th className="px-4 py-2 text-right font-normal">
                  <Tip text="How much lower the log loss is than the base-rate benchmark. Positive means more accurate.">Improvement vs base rate</Tip>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <ScoreRow label="ODDSIQ ensemble" s={b.scores.ensemble} base={base} strong />
              <ScoreRow label="Dixon-Coles (goals model)" s={b.scores.poisson} base={base} />
              <ScoreRow label="Elo" s={b.scores.elo} base={base} />
              <ScoreRow label="Base rate (benchmark)" s={base} />
            </tbody>
          </table>
          <table className="mt-2 w-full border-t border-line text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-line">
                <th className="px-4 py-2 font-normal">Goals markets</th>
                <th className="px-2 py-2 text-right font-normal">Log loss</th>
                <th className="px-2 py-2 text-right font-normal">Brier</th>
                <th className="px-4 py-2 text-right font-normal">Base-rate log loss</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-ink-2">
              {[
                ["Over/under 2.5 goals", b.goals.ou25, b.goals.ou25BaseRate],
                ["Both teams to score", b.goals.btts, b.goals.bttsBaseRate],
              ].map(([label, s, base]) => (
                <tr key={label as string}>
                  <td className="px-4 py-1.5">{label as string}</td>
                  <td className="num px-2 py-1.5 text-right">{f3((s as ModelScore).logLoss)}</td>
                  <td className="num px-2 py-1.5 text-right">{f3((s as ModelScore).brier)}</td>
                  <td className="num px-4 py-1.5 text-right">{f3((base as ModelScore)?.logLoss)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
            Historical · n = {fmtInt(b.n)} matches · {fmtPeriod(b.from, b.to)} · source {b.source} · model {REAL_MODEL.ensemble.id}. Each forecast used only matches played before it. The base rate is the home/draw/away split of the previous three seasons. The results source has no bookmaker prices, so this backtest cannot show whether the model beats the market; the live ledger below measures that. Past accuracy does not guarantee future accuracy.
          </p>
        </div>
        <div className="border-t border-line lg:border-l lg:border-t-0">
          <p className="px-4 pt-3 text-xs text-ink-2">Calibration, all 1X2 probabilities</p>
          <CalibrationChart bins={b.calibration} />
        </div>
      </div>
    </Panel>
  );
}

export default async function RealModelPage() {
  const now = await wallClock();
  const stored = DATABASE_CONFIGURED ? await storedBacktests(db()) : [];
  const backtests = stored.length ? stored : [snapshotBacktest()];
  const live = DATABASE_CONFIGURED ? await livePredictions(db()) : null;
  const upcoming = live?.rows.filter((r) => r.kickoff > now).sort((a, b) => a.kickoff - b.kickoff) ?? [];
  const recent = live?.rows.filter((r) => r.kickoff <= now).slice(0, 30) ?? [];
  const s = live?.summary;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Real Model"
        subtitle="ODDSIQ football model v1.0, trained on real match results. The other Model Lab pages still describe the demo models."
        right={<Badge tone="accent">Real data</Badge>}
      />

      <Panel title="How it works">
        <div className="grid gap-4 px-4 py-3 text-sm text-ink-2 md:grid-cols-3">
          <p>{REAL_MODEL.notes}</p>
          <p>
            A prediction is written to the append-only ledger once per market, at the first data run within {PREDICTION_LEAD_MS / 3_600_000} hours of kickoff, together with the best bookmaker price at that moment. The closing line and the result are added afterwards and never replace it.
          </p>
          <p>{UNCERTAINTY_NOTE}</p>
        </div>
      </Panel>

      {backtests.map((b) => (
        <Backtest key={b.league} b={b} />
      ))}

      <Panel title="Live record" right={<span className="text-xs text-muted">Live · real bookmaker prices</span>}>
        {!live ? (
          <p className="px-4 py-3 text-sm text-muted">Connect the database and odds feed (see Data Feed) to start recording real predictions.</p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 px-4 py-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted">Predictions recorded</dt>
                <dd className="num text-lg">{fmtInt(s!.predictions)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">
                  <Tip text="Closing line value: recorded price × de-vigged closing probability − 1, averaged. Positive means the recorded prices beat the close.">Average CLV</Tip>
                </dt>
                <dd className="num text-lg">{s!.avgClv === null ? "—" : <Signed value={s!.avgClv}>{fmtSignedPct(s!.avgClv)}</Signed>}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Settled</dt>
                <dd className="num text-lg">{fmtInt(s!.settled)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">
                  <Tip text="Brier score of the model and of the de-vigged closing market on the same settled selections. Lower is better.">Brier model / closing market</Tip>
                </dt>
                <dd className="num text-lg">
                  {f3(s!.brierModel)} / {f3(s!.brierMarket)}
                </dd>
              </div>
            </dl>
            <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
              Live · CLV n = {fmtInt(s!.withClose)}, settled n = {fmtInt(s!.settled)} · {fmtPeriod(s!.periodFrom, s!.periodTo)} · model {REAL_MODEL.ensemble.id} · prices from The Odds API.
              {s!.settled < MIN_SAMPLE_FOR_WARNING && ` Fewer than ${MIN_SAMPLE_FOR_WARNING} settled selections: too few to judge the model against the market yet.`}
            </p>
          </>
        )}
      </Panel>

      {live && (
        <Panel title="Recorded predictions" right={<span className="text-xs text-muted">Newest first</span>}>
          {upcoming.length + recent.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">None yet. Predictions appear within {PREDICTION_LEAD_MS / 3_600_000} hours of kickoff for competitions in the feed.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr className="border-b border-line">
                    <th className="px-4 py-2 font-normal">Kickoff (UTC)</th>
                    <th className="px-2 py-2 font-normal">Match · selection</th>
                    <th className="px-2 py-2 text-right font-normal">Model</th>
                    <th className="px-2 py-2 text-right font-normal">Market then</th>
                    <th className="px-2 py-2 text-right font-normal">Difference</th>
                    <th className="px-2 py-2 text-right font-normal">Price recorded</th>
                    <th className="px-2 py-2 text-right font-normal">CLV</th>
                    <th className="px-4 py-2 text-right font-normal">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[...upcoming, ...recent].map((r) => (
                    <tr key={r.id}>
                      <td className="num whitespace-nowrap px-4 py-2 text-ink-2">{fmtShortDateTime(r.kickoff)}</td>
                      <td className="px-2 py-2">
                        <div>{r.match}</div>
                        <div className="text-xs text-muted">
                          {r.market} · {r.selection} · recorded {fmtShortDateTime(r.createdAt)}
                        </div>
                      </td>
                      <td className="num px-2 py-2 text-right">
                        <Tip text={`Range ${fmtPct(r.ciLow)}–${fmtPct(r.ciHigh)} · confidence ${r.confidence}/100`}>{fmtPct(r.probability)}</Tip>
                      </td>
                      <td className="num px-2 py-2 text-right text-ink-2">{fmtPct(r.marketProbability)}</td>
                      <td className="num px-2 py-2 text-right">{r.marketProbability === null ? "—" : fmtPp((r.probability - r.marketProbability) * 100)}</td>
                      <td className="num whitespace-nowrap px-2 py-2 text-right text-ink-2">
                        {r.odds.toFixed(2)} <span className="text-xs text-muted">{r.bookmaker}</span>
                      </td>
                      <td className="num px-2 py-2 text-right">{r.clv === null ? "—" : <Signed value={r.clv}>{fmtSignedPct(r.clv)}</Signed>}</td>
                      <td className="px-4 py-2 text-right text-xs">{r.result ?? (r.kickoff > now ? "upcoming" : "pending")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="border-t border-line px-4 py-2 text-[11px] text-muted">A difference between the model and the market is a disagreement to examine, not a recommendation.</p>
        </Panel>
      )}

      {live && live.missing.length > 0 && (
        <Panel title="Markets without a prediction">
          <ul className="divide-y divide-line text-sm">
            {live.missing.map((m) => (
              <li key={m.match + m.kickoff} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <span>
                  {m.match} <span className="num text-xs text-muted">{fmtShortDateTime(m.kickoff)}</span>
                </span>
                <span className="text-xs text-ink-2">{m.reason}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
