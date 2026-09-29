import { Histogram } from "@/components/charts/Histogram";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { Badge, MetricContextLine, PageHeader, Panel, Signed, StatTile } from "@/components/ui";
import { requestNow } from "@/lib/data";
import { avgPriceRatioClv, breakdown, clvBuckets, dimension, histogram, VERSION_MARKERS, weeklySeries } from "@/lib/demo/analytics";
import { performanceSummary, VALUE_RULE_TEXT } from "@/lib/demo/performance";
import { ledgerRows } from "@/lib/demo/store";
import { fmtInt, fmtPct, fmtPeriod, fmtSignedPct } from "@/lib/format";
import { CLV_METHODOLOGY } from "@/lib/metrics/clv";
import { metric, MIN_SAMPLE_FOR_WARNING, periodOf } from "@/lib/metrics/metric";

export const metadata = { title: "Closing Line Value · ODDSIQ" };

const pct0 = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(0)}%`;

export default async function ClvPage() {
  const now = await requestNow();
  const rows = ledgerRows(now);
  const perf = performanceSummary(now);
  const closed = rows.filter((r) => r.clv !== undefined);
  const ratio = avgPriceRatioClv(closed);
  const weeks = weeklySeries(rows);
  const buckets = clvBuckets(rows);
  const byLeague = breakdown(closed, dimension("league"));
  const byOdds = breakdown(closed, dimension("odds"));
  const period = periodOf(closed.map((r) => r.prediction.createdAt));
  const ratioMetric = metric(ratio.value, {
    n: ratio.n,
    ...period,
    modelVersion: perf.avgClv.modelVersion,
    source: perf.avgClv.source,
    definition: "Price-ratio CLV = odds at prediction ÷ consensus closing odds − 1. Simpler, but the recorded price is the best across bookmakers while the closing consensus still contains the margin, so it reads higher than the de-vigged method.",
    basis: "historical",
  });

  return (
    <div className="space-y-5">
      <PageHeader title="Closing Line Value" subtitle="Did the prices recorded at prediction time beat where the market finally closed? CLV is the most direct test of whether the model finds prices before the market does." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Avg CLV, all" value={<Signed value={perf.avgClv.value}>{fmtSignedPct(perf.avgClv.value)}</Signed>} m={perf.avgClv} />
        <StatTile label="Avg CLV, opportunities" value={<Signed value={perf.opportunityClv.value}>{fmtSignedPct(perf.opportunityClv.value)}</Signed>} m={perf.opportunityClv} />
        <StatTile label="Beat the close" value={<span className="num">{fmtPct(perf.positiveClvShare.value)}</span>} m={perf.positiveClvShare} />
        <StatTile label="Avg CLV, price ratio" value={<Signed value={ratio.value}>{fmtSignedPct(ratio.value)}</Signed>} m={ratioMetric} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="CLV distribution" right="All closed predictions">
          <Histogram bins={histogram(closed.map((r) => r.clv!), -0.3, 0.3, 30)} format={pct0} reference={0} label="Distribution of closing line value" width={480} />
          <div className="border-t border-line px-4 py-2">
            <MetricContextLine m={perf.avgClv} />
            <p className="mt-1 text-[11px] text-muted">Values beyond ±30% are counted in the edge bars. Most predictions are recorded at the best available price, so positive CLV is expected only where the model and the late market agree.</p>
          </div>
        </Panel>
        <Panel title="Weekly average CLV" right="By week of prediction">
          <TimeSeriesChart
            label="Weekly average CLV"
            series={[{ label: "Avg CLV", color: "var(--series-market)", points: weeks.map((w) => ({ t: w.weekStart, v: w.avgClv })) }]}
            format={(v) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(1)}%`}
            markers={VERSION_MARKERS}
            zero
            width={480}
          />
          <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
            Historical · {fmtInt(weeks.length)} weeks · weekly samples {fmtInt(Math.min(...weeks.map((w) => w.n)))}–{fmtInt(Math.max(...weeks.map((w) => w.n)))} settled predictions · dashed lines mark model releases
          </p>
        </Panel>
      </div>

      <Panel title="Does beating the close line up with results?" right="Simulated flat stakes by CLV bucket">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-line text-[10.5px] uppercase tracking-wider text-muted">
              <th className="px-4 py-2 text-left font-medium">CLV bucket</th>
              <th className="px-2.5 py-2 text-right font-medium">n</th>
              <th className="px-2.5 py-2 text-right font-medium">Avg CLV</th>
              <th className="px-2.5 py-2 text-right font-medium">Win rate</th>
              <th className="px-4 py-2 text-right font-medium">Simulated ROI</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={b.label} className="border-b border-line/60">
                <td className="px-4 py-2">
                  {b.label}
                  {b.n < MIN_SAMPLE_FOR_WARNING && (
                    <Badge tone="warning" className="ml-2">
                      n &lt; {MIN_SAMPLE_FOR_WARNING}
                    </Badge>
                  )}
                </td>
                <td className="num px-2.5 py-2 text-right">{fmtInt(b.n)}</td>
                <td className="num px-2.5 py-2 text-right">
                  <Signed value={b.avgClv}>{fmtSignedPct(b.avgClv)}</Signed>
                </td>
                <td className="num px-2.5 py-2 text-right text-ink-2">{fmtPct(b.staking.winRate)}</td>
                <td className="num px-4 py-2 text-right">
                  <Signed value={b.staking.roi}>{fmtSignedPct(b.staking.roi)}</Signed>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-4 py-2 text-[11px] text-muted">
          Simulated · settled predictions only · {fmtPeriod(period.periodFrom, period.periodTo)}. A 1-unit stake on every prediction in the bucket at the recorded price; no stakes were placed. This shows association, not cause: CLV is measured after the fact and cannot be known when the price is taken.
        </p>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="CLV by league">
          <ClvTable rows={byLeague} heading="League" />
        </Panel>
        <Panel title="CLV by odds range">
          <ClvTable rows={byOdds} heading="Odds at prediction" />
        </Panel>
      </div>

      <Panel title="Methodology">
        <div className="space-y-2 px-4 py-3 text-sm text-ink-2">
          <p>{CLV_METHODOLOGY}</p>
          <p>The closing probability is the margin-free consensus of all tracked bookmakers at kickoff. The price-ratio variant is shown alongside for comparison. It compares the best recorded price with the margin-inclusive consensus close, so it reads higher; the de-vigged figure is the one used everywhere else.</p>
          <p>{VALUE_RULE_TEXT}</p>
        </div>
      </Panel>
    </div>
  );
}

function ClvTable({ rows, heading }: { rows: ReturnType<typeof breakdown>; heading: string }) {
  return (
    <table className="w-full text-[12.5px]">
      <thead>
        <tr className="border-b border-line text-[10.5px] uppercase tracking-wider text-muted">
          <th className="px-4 py-2 text-left font-medium">{heading}</th>
          <th className="px-2.5 py-2 text-right font-medium">n</th>
          <th className="px-2.5 py-2 text-right font-medium">Avg CLV</th>
          <th className="px-4 py-2 text-right font-medium">Beat close</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => (
          <tr key={s.key} className="border-b border-line/60">
            <td className="px-4 py-2">
              {s.label}
              {s.clvN < MIN_SAMPLE_FOR_WARNING && (
                <Badge tone="warning" className="ml-2">
                  n &lt; {MIN_SAMPLE_FOR_WARNING}
                </Badge>
              )}
            </td>
            <td className="num px-2.5 py-2 text-right">{fmtInt(s.clvN)}</td>
            <td className="num px-2.5 py-2 text-right">
              <Signed value={s.avgClv}>{fmtSignedPct(s.avgClv)}</Signed>
            </td>
            <td className="num px-4 py-2 text-right text-ink-2">{fmtPct(s.positiveClvShare)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
