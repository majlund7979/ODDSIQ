import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { Badge, PageHeader, Panel, Signed } from "@/components/ui";
import { requestNow } from "@/lib/data";
import { backtestRules, isSettled, VERSION_MARKERS } from "@/lib/demo/analytics";
import { VALUE_RULE, VALUE_RULE_TEXT } from "@/lib/demo/performance";
import { ledgerRows } from "@/lib/demo/store";
import { fmtInt, fmtPct, fmtPeriod, fmtSignedPct } from "@/lib/format";
import { periodOf } from "@/lib/metrics/metric";

export const metadata = { title: "Backtest · ODDSIQ" };

const COLORS = ["var(--series-market)", "var(--series-model)", "var(--series-3)"];

export default async function BacktestPage() {
  const now = await requestNow();
  const rows = ledgerRows(now);
  const results = backtestRules(rows, VALUE_RULE);
  const period = periodOf(rows.filter(isSettled).map((r) => r.prediction.createdAt));
  const curves = [results.find((r) => r.minEv === 0 && r.minConfidence === 0)!, results.find((r) => r.published)!, results.find((r) => r.minEv === 0.08 && r.minConfidence === 0)!];
  const ruleLabel = (r: (typeof results)[number]) => `EV ≥ ${fmtPct(r.minEv, 0)}${r.minConfidence ? `, confidence ≥ ${r.minConfidence}` : ""}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Backtest"
        subtitle="Selection rules replayed over the prediction ledger. Each rule picks predictions using only what was recorded before kickoff: the model probability, the recorded price and the confidence score."
        right={<Badge tone="accent">Simulated</Badge>}
      />

      <Panel title="Simulated equity by rule" right="1-unit flat stakes at the recorded price">
        <TimeSeriesChart
          label="Simulated cumulative profit by rule"
          series={curves.map((r, i) => ({ label: `${ruleLabel(r)}${r.published ? " (published rule)" : ""}`, color: COLORS[i], points: r.staking.equity.map((p) => ({ t: p.at, v: p.value })), dashed: i === 0 }))}
          format={(v) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(0)}u`}
          markers={VERSION_MARKERS}
          zero
          height={300}
          width={1100}
        />
      </Panel>

      <Panel title="Rule grid" right={`Settled predictions · ${fmtPeriod(period.periodFrom, period.periodTo)}`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-[10.5px] uppercase tracking-wider text-muted">
                <th className="px-4 py-2 text-left font-medium">Rule</th>
                <th className="px-2.5 py-2 text-right font-medium">Stakes</th>
                <th className="px-2.5 py-2 text-right font-medium">Win rate</th>
                <th className="px-2.5 py-2 text-right font-medium">Profit</th>
                <th className="px-2.5 py-2 text-right font-medium">ROI</th>
                <th className="px-2.5 py-2 text-right font-medium">Max drawdown</th>
                <th className="px-2.5 py-2 text-right font-medium">Profit factor</th>
                <th className="px-4 py-2 text-right font-medium">Avg CLV</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={`${r.minEv}-${r.minConfidence}`} className={`border-b border-line/60 ${r.published ? "bg-surface-2" : ""}`}>
                  <td className="px-4 py-2">
                    {ruleLabel(r)}
                    {r.published && (
                      <Badge tone="accent" className="ml-2">
                        Published rule
                      </Badge>
                    )}
                  </td>
                  <td className="num px-2.5 py-2 text-right">{fmtInt(r.staking.stakes)}</td>
                  <td className="num px-2.5 py-2 text-right text-ink-2">{fmtPct(r.staking.winRate)}</td>
                  <td className="num px-2.5 py-2 text-right">
                    <Signed value={r.staking.profit}>
                      {r.staking.profit >= 0 ? "+" : "−"}
                      {Math.abs(r.staking.profit).toFixed(1)} u
                    </Signed>
                  </td>
                  <td className="num px-2.5 py-2 text-right">
                    <Signed value={r.staking.roi}>{fmtSignedPct(r.staking.roi)}</Signed>
                  </td>
                  <td className="num px-2.5 py-2 text-right text-ink-2">{r.staking.maxDrawdown.toFixed(1)} u</td>
                  <td className="num px-2.5 py-2 text-right text-ink-2">{Number.isFinite(r.staking.profitFactor) ? r.staking.profitFactor.toFixed(2) : "—"}</td>
                  <td className="num px-4 py-2 text-right">
                    <Signed value={r.avgClv}>{fmtSignedPct(r.avgClv)}</Signed>
                    <span className="ml-1 text-[10.5px] text-muted">n {fmtInt(r.clvN)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Read this before comparing rules">
        <ul className="list-disc space-y-1.5 py-3 pr-4 pl-8 text-sm text-ink-2">
          <li>Every figure is simulated. No stakes were placed, and real prices may not have been available in size.</li>
          <li>Only the published rule was fixed in advance. {VALUE_RULE_TEXT}</li>
          <li>Picking the best row of this grid after seeing the results is overfitting: the winning rule will usually look worse on future data.</li>
          <li>Backtests use the model version that was live at the time. Older events are never re-scored with newer versions, because those versions were trained on them.</li>
          <li>Past simulated results do not predict future results.</li>
        </ul>
        <p className="border-t border-line px-4 py-2 text-[11px] text-muted">Simulated · Source: ODDSIQ prediction ledger (DEMO DATA)</p>
      </Panel>
    </div>
  );
}
