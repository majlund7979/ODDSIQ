import Link from "next/link";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { Badge, PageHeader, Panel, Signed, Tip } from "@/components/ui";
import { DEMO_MODE, requestNow } from "@/lib/data";
import { DemoOnly } from "@/components/DemoOnly";
import { driftReport, scanErrorPatterns, segmentStats, VERSION_MARKERS, weeklySeries } from "@/lib/demo/analytics";
import { COMPONENT_MODELS, MODEL_FAMILIES, MODEL_VERSIONS, releaseAt } from "@/lib/demo/models";
import { ledgerRows } from "@/lib/demo/store";
import { fmtDate, fmtInt, fmtPct, fmtPeriod, fmtSignedPct } from "@/lib/format";
import { MIN_SAMPLE_FOR_WARNING } from "@/lib/metrics/metric";

export const metadata = { title: "Model Lab · ODDSIQ" };

const statusTone = { STABLE: "good", WATCH: "warning", DRIFT: "critical" } as const;

export default async function ModelLabPage() {
  if (!DEMO_MODE) return <DemoOnly title="Model Lab" needs="the six demo model families (the real model has its own page)" />;
  const now = await requestNow();
  const rows = ledgerRows(now);
  const current = releaseAt(now);
  const versions = MODEL_VERSIONS.filter((v) => v.familyId === "ensemble")
    .map((v) => ({ v, s: segmentStats(rows.filter((r) => r.prediction.modelVersionId === v.id), v.id, v.id) }))
    .filter((x) => x.s.predictions > 0);
  const weeks = weeklySeries(rows);
  const drift = driftReport(rows, now);
  const scan = scanErrorPatterns(rows);
  const all = segmentStats(rows);

  const sections = [
    { href: "/model-lab/real-model", title: "Real Model", body: "The football model trained on real results: backtest, calibration and its live record against real prices.", badge: <Badge tone="accent">real data</Badge> },
    { href: "/model-lab/ledger", title: "Prediction Ledger", body: `${fmtInt(all.predictions)} immutable, hash-chained predictions with CSV export.` },
    { href: "/model-lab/audit", title: "Model Audit", body: "Chain verification, missing predictions and version changes." },
    { href: "/model-lab/backtest", title: "Backtest", body: "Selection rules replayed over the ledger, with simulated returns and CLV." },
    {
      href: "/model-lab/errors",
      title: "Error Analysis",
      body: `${scan.patterns.length} significant pattern${scan.patterns.length === 1 ? "" : "s"} from ${fmtInt(scan.segmentsTested)} segments tested.`,
      badge: scan.patterns.length ? <Badge tone="warning">{scan.patterns.length} found</Badge> : <Badge tone="good">none</Badge>,
    },
    { href: "/model-lab/drift", title: "Drift Monitor", body: "Recent 4 weeks against the 12 weeks before.", badge: <Badge tone={statusTone[drift.status]}>{drift.status}</Badge> },
    { href: "/performance/clv", title: "Closing Line Value", body: "Whether recorded prices beat the closing market." },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Model Lab"
        subtitle="The models behind every probability: versions, how each has scored against outcomes and the closing market, where they go wrong, and whether they are drifting."
        right={<span className="text-xs text-muted">Current ensemble release v{current.version} · since {fmtDate(current.releasedAt)}</span>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sections.map((s) => (
          <Link key={s.href} href={s.href} className="rounded-md border border-line bg-surface px-4 py-3 hover:border-line-strong hover:bg-surface-2">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-2">
              {s.title}
              {s.badge}
            </div>
            <p className="mt-1.5 text-sm text-ink-2">{s.body}</p>
          </Link>
        ))}
      </div>

      <Panel title="Ensemble versions" right="Only the ensemble is recorded in the ledger">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-[10.5px] uppercase tracking-wider text-muted">
                <th className="px-4 py-2 text-left font-medium">Version</th>
                <th className="px-2.5 py-2 text-left font-medium">Status</th>
                <th className="px-2.5 py-2 text-left font-medium">Released</th>
                <th className="px-2.5 py-2 text-left font-medium">Training data</th>
                <th className="px-2.5 py-2 text-right font-medium">n settled</th>
                <th className="px-2.5 py-2 text-right font-medium">
                  <Tip text="Model Brier score and the de-vigged closing market's Brier score on the same predictions. Lower is better.">Brier model / mkt</Tip>
                </th>
                <th className="px-2.5 py-2 text-right font-medium">Log loss</th>
                <th className="px-2.5 py-2 text-right font-medium">Calib. error</th>
                <th className="px-4 py-2 text-right font-medium">Avg CLV</th>
              </tr>
            </thead>
            <tbody>
              {versions.map(({ v, s }) => (
                <tr key={v.id} className="border-b border-line/60">
                  <td className="px-4 py-2">
                    <div className="num">{v.id}</div>
                    <div className="text-[11px] text-muted">{v.notes}</div>
                  </td>
                  <td className="px-2.5 py-2">{v.version === current.version ? <Badge tone="good">Active</Badge> : <Badge>Retired</Badge>}</td>
                  <td className="num px-2.5 py-2 text-ink-2">{fmtDate(v.releasedAt)}</td>
                  <td className="px-2.5 py-2 text-ink-2">{fmtPeriod(v.trainingFrom, v.trainingTo)}</td>
                  <td className="num px-2.5 py-2 text-right">
                    {fmtInt(s.n)}
                    {s.n < MIN_SAMPLE_FOR_WARNING && (
                      <Badge tone="warning" className="ml-2">
                        low n
                      </Badge>
                    )}
                  </td>
                  <td className="num px-2.5 py-2 text-right">
                    <span className={s.brier <= s.marketBrier ? "text-good" : ""}>{s.brier.toFixed(3)}</span>
                    <span className="text-muted"> / {s.marketBrier.toFixed(3)}</span>
                  </td>
                  <td className="num px-2.5 py-2 text-right text-ink-2">{s.logLoss.toFixed(3)}</td>
                  <td className="num px-2.5 py-2 text-right text-ink-2">{fmtPct(s.calibrationError)}</td>
                  <td className="num px-4 py-2 text-right">
                    <Signed value={s.avgClv}>{fmtSignedPct(s.avgClv)}</Signed>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
          Historical · each version is scored only on the predictions it actually published, so versions cover different periods and fixtures and are not a like-for-like race. Older events are never re-scored with newer versions, because those versions were trained on them. Source: ODDSIQ prediction ledger (DEMO DATA).
        </p>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Weekly Brier score, model vs closing market" className="xl:col-span-2">
          <TimeSeriesChart
            label="Weekly Brier score of the model and the closing market"
            series={[
              { label: "ODDSIQ model", color: "var(--series-model)", points: weeks.map((w) => ({ t: w.weekStart, v: w.brier })) },
              { label: "Closing market (de-vigged)", color: "var(--series-market)", points: weeks.map((w) => ({ t: w.weekStart, v: w.marketBrier })), dashed: true },
            ]}
            format={(v) => v.toFixed(3)}
            markers={VERSION_MARKERS}
          />
          <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
            Historical · {fmtInt(all.n)} settled predictions · {fmtPeriod(all.periodFrom, all.periodTo)} · lower is better. The closing market has information the model did not have when it predicted, so matching it is a strong result.
          </p>
        </Panel>
        <Panel title="Component models" right="Blended into the ensemble">
          <ul className="divide-y divide-line">
            {COMPONENT_MODELS.map((c) => {
              const fam = MODEL_FAMILIES.find((f) => f.id === c.familyId)!;
              return (
                <li key={c.versionId} className="px-4 py-2.5">
                  <div className="flex items-center justify-between text-sm">
                    <span>
                      {fam.name} <span className="num text-[11px] text-muted">{c.versionId}</span>
                    </span>
                    <span className="num text-ink-2">{fmtPct(c.weight, 0)}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted">{fam.description}</p>
                </li>
              );
            })}
          </ul>
          <p className="border-t border-line px-4 py-2 text-[11px] text-muted">Weights are fixed per release. Component outputs are shown on each market page; only the blended ensemble is ledgered and scored.</p>
        </Panel>
      </div>
    </div>
  );
}
