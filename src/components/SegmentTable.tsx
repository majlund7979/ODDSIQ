import { Badge, Signed, Tip } from "@/components/ui";
import type { SegmentStats } from "@/lib/demo/analytics";
import { fmtInt, fmtPct, fmtPp, fmtSignedPct } from "@/lib/format";
import { MIN_SAMPLE_FOR_WARNING } from "@/lib/metrics/metric";

const th = "px-2.5 py-2 font-medium";

/** Per-segment accuracy, calibration, CLV and simulated returns, each with its own sample size. */
export function SegmentTable({ rows, heading, total }: { rows: SegmentStats[]; heading: string; total?: SegmentStats }) {
  const all = total ? [...rows, total] : rows;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-line text-[10.5px] uppercase tracking-wider text-muted">
            <th className={`${th} pl-4 text-left`}>{heading}</th>
            <th className={`${th} text-right`}>
              <Tip text="Settled predictions: the sample behind every accuracy figure in the row.">n</Tip>
            </th>
            <th className={`${th} text-right`}>
              <Tip text="Mean predicted probability vs the share of those selections that won.">Pred. / Obs.</Tip>
            </th>
            <th className={`${th} text-right`}>
              <Tip text="Observed minus predicted win rate. Positive means the model was too low. z is the gap in standard errors.">Bias</Tip>
            </th>
            <th className={`${th} text-right`}>
              <Tip text="Brier score of the model, and of the de-vigged closing market on the same predictions. Lower is better.">Brier model / mkt</Tip>
            </th>
            <th className={`${th} text-right`}>Log loss</th>
            <th className={`${th} text-right`}>
              <Tip text="Average closing line value of predictions whose market has closed, with its own sample size.">Avg CLV</Tip>
            </th>
            <th className={`${th} pr-4 text-right`}>
              <Tip text="Simulated 1-unit flat stakes on tracked opportunities in the segment. No stakes were placed.">Sim. ROI (opps)</Tip>
            </th>
          </tr>
        </thead>
        <tbody>
          {all.map((s) => {
            const isTotal = s === total;
            return (
              <tr key={s.key} className={`border-b border-line/60 ${isTotal ? "bg-surface-2 font-medium" : "hover:bg-surface-2"}`}>
                <td className="px-2.5 py-2 pl-4">
                  {s.label}
                  {s.lowSample && (
                    <Badge tone="warning" className="ml-2">
                      n &lt; {MIN_SAMPLE_FOR_WARNING}
                    </Badge>
                  )}
                </td>
                <td className="num px-2.5 py-2 text-right">{fmtInt(s.n)}</td>
                <td className="num px-2.5 py-2 text-right text-ink-2">
                  {fmtPct(s.meanPredicted)} / {fmtPct(s.hitRate)}
                </td>
                <td className="num px-2.5 py-2 text-right">
                  <span className={s.lowSample ? "text-muted" : ""}>{fmtPp(s.biasPp)}</span>
                  <span className="ml-1 text-[10.5px] text-muted">z {Number.isFinite(s.biasZ) ? s.biasZ.toFixed(1) : "—"}</span>
                </td>
                <td className="num px-2.5 py-2 text-right">
                  <span className={s.brier <= s.marketBrier ? "text-good" : "text-ink"}>{s.brier.toFixed(3)}</span>
                  <span className="text-muted"> / {s.marketBrier.toFixed(3)}</span>
                </td>
                <td className="num px-2.5 py-2 text-right text-ink-2">{s.logLoss.toFixed(3)}</td>
                <td className="num px-2.5 py-2 text-right">
                  <Signed value={s.avgClv}>{fmtSignedPct(s.avgClv)}</Signed>
                  <span className="ml-1 text-[10.5px] text-muted">n {fmtInt(s.clvN)}</span>
                </td>
                <td className="num px-2.5 py-2 pr-4 text-right">
                  {s.opportunities.stakes ? (
                    <>
                      <Signed value={s.opportunities.roi}>{fmtSignedPct(s.opportunities.roi)}</Signed>
                      <span className="ml-1 text-[10.5px] text-muted">n {fmtInt(s.opportunities.stakes)}</span>
                    </>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
