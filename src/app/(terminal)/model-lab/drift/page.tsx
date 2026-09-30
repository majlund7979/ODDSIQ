import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { Badge, PageHeader, Panel, Tip } from "@/components/ui";
import { driftReport, DRIFT_WINDOWS, VERSION_MARKERS, weeklySeries, type DriftCheck } from "@/lib/demo/analytics";

import { fmtDate, fmtInt, fmtPct, fmtSignedPct } from "@/lib/format";
import { terminal } from "@/lib/terminal";

export const metadata = { title: "Drift Monitor · ODDSIQ" };

const tone = { STABLE: "good", WATCH: "warning", DRIFT: "critical" } as const;

function fmtValue(c: DriftCheck, v: number) {
  if (!Number.isFinite(v)) return "—";
  if (c.format === "brier") return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(4)}`;
  if (c.format === "pp") return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)} pp`;
  if (c.format === "pct") return fmtSignedPct(v);
  return fmtPct(v);
}

export default async function DriftPage() {
  const t = await terminal();
  const now = t.now;
  const rows = t.ledgerRows();
  const report = driftReport(rows, now);
  const weeks = weeklySeries(rows);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Drift Monitor"
        subtitle={`Is the model still performing the way it did? The last ${DRIFT_WINDOWS.recentDays} days of settled predictions are compared with the ${DRIFT_WINDOWS.baselineDays} days before.`}
        right={<Badge tone={tone[report.status]}>Overall {report.status}</Badge>}
      />

      <Panel title="Checks" right={`Baseline ${fmtDate(report.baselineFrom)} – ${fmtDate(report.recentFrom)} · recent ${fmtDate(report.recentFrom)} – ${fmtDate(report.to)}`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-[10.5px] uppercase tracking-wider text-muted">
                <th className="px-4 py-2 text-left font-medium">Check</th>
                <th className="px-2.5 py-2 text-right font-medium">Baseline</th>
                <th className="px-2.5 py-2 text-right font-medium">Recent</th>
                <th className="px-2.5 py-2 text-right font-medium">n base / recent</th>
                <th className="px-2.5 py-2 text-right font-medium">Statistic</th>
                <th className="px-4 py-2 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {report.checks.map((c) => (
                <tr key={c.id} className="border-b border-line/60">
                  <td className="px-4 py-2">
                    <Tip text={c.definition}>{c.label}</Tip>
                  </td>
                  <td className="num px-2.5 py-2 text-right text-ink-2">{fmtValue(c, c.baseline)}</td>
                  <td className="num px-2.5 py-2 text-right">{fmtValue(c, c.recent)}</td>
                  <td className="num px-2.5 py-2 text-right text-ink-2">
                    {fmtInt(c.nBaseline)} / {fmtInt(c.nRecent)}
                  </td>
                  <td className="num px-2.5 py-2 text-right text-ink-2">
                    {c.statisticLabel} {Number.isFinite(c.statistic) ? c.statistic.toFixed(2) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Badge tone={tone[c.status]}>{c.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
          Historical · z-scores compare the two windows&apos; means in the worsening direction: WATCH at 2 or more, DRIFT at 3 or more. PSI: WATCH from 0.10, DRIFT from 0.25. A flag says performance changed; it does not say why. Source: {t.ledgerSource}.
        </p>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Weekly Brier score" right="Model vs closing market">
          <TimeSeriesChart
            label="Weekly Brier score"
            series={[
              { label: "ODDSIQ model", color: "var(--series-model)", points: weeks.map((w) => ({ t: w.weekStart, v: w.brier })) },
              { label: "Closing market", color: "var(--series-market)", points: weeks.map((w) => ({ t: w.weekStart, v: w.marketBrier })), dashed: true },
            ]}
            format={(v) => v.toFixed(3)}
            markers={VERSION_MARKERS}
            width={480}
          />
        </Panel>
        <Panel title="Weekly gap to the market" right="Model Brier minus market Brier">
          <TimeSeriesChart
            label="Weekly Brier gap between model and market"
            series={[{ label: "Model − market", color: "var(--series-3)", points: weeks.map((w) => ({ t: w.weekStart, v: w.brier - w.marketBrier })) }]}
            format={(v) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(3)}`}
            markers={VERSION_MARKERS}
            zero
            width={480}
          />
          <p className="border-t border-line px-4 py-2 text-[11px] text-muted">Below zero, the model scored better than the closing market that week. Weekly samples: {fmtInt(Math.min(...weeks.map((w) => w.n)))}–{fmtInt(Math.max(...weeks.map((w) => w.n)))} settled predictions.</p>
        </Panel>
      </div>
    </div>
  );
}
