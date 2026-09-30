import Link from "next/link";
import { CalibrationChart } from "@/components/charts/CalibrationChart";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { SegmentTable } from "@/components/SegmentTable";
import { LinkTabs, MetricContextLine, PageHeader, Panel, Signed, StatTile } from "@/components/ui";
import { requestNow } from "@/lib/data";
import { breakdown, dimension, DIMENSIONS, segmentStats, VERSION_MARKERS } from "@/lib/demo/analytics";
import { performanceSummary, VALUE_RULE_TEXT } from "@/lib/demo/performance";
import { SPORTS } from "@/lib/demo/catalog";
import { ledgerRows } from "@/lib/demo/store";
import { fmtInt, fmtPct, fmtSignedPct } from "@/lib/format";

export const metadata = { title: "Performance · ODDSIQ" };

export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ by?: string; sport?: string }> }) {
  const now = await requestNow();
  const sp = await searchParams;
  const dim = dimension(sp.by);
  const sport = SPORTS.find((s) => s.id === sp.sport)?.id ?? "all";
  const filter = sport === "all" ? undefined : (r: ReturnType<typeof ledgerRows>[number]) => r.event.sportId === sport;
  const rows = filter ? ledgerRows(now).filter(filter) : ledgerRows(now);
  const perf = performanceSummary(now, filter);
  const total = segmentStats(rows, "total", "All");
  const segments = breakdown(rows, dim);
  const st = perf.staking.value;
  const href = (by: string, s: string) => `/performance?${new URLSearchParams({ ...(by !== "market" && { by }), ...(s !== "all" && { sport: s }) })}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Performance"
        subtitle="How the ledgered predictions have scored against real outcomes and against the closing market. Every figure is recomputed from the prediction ledger."
        right={
          <div className="flex gap-3 text-xs">
            <Link href="/performance/clv" className="text-accent hover:underline">
              CLV dashboard →
            </Link>
            <Link href="/model-lab/ledger" className="text-accent hover:underline">
              Prediction ledger →
            </Link>
          </div>
        }
      />

      <LinkTabs label="Sport" active={sport} items={[{ id: "all", label: "All sports", href: href(dim.id, "all") }, ...SPORTS.map((s) => ({ id: s.id, label: s.name, href: href(dim.id, s.id) }))]} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Settled predictions" value={<span className="num">{fmtInt(perf.settled.value)}</span>} m={perf.settled} />
        <StatTile
          label="Brier score"
          value={
            <span className="num">
              {perf.brier.value.toFixed(3)} <span className="text-sm text-muted">mkt {total.marketBrier.toFixed(3)}</span>
            </span>
          }
          m={perf.brier}
        />
        <StatTile label="Log loss" value={<span className="num">{perf.logLoss.value.toFixed(3)}</span>} m={perf.logLoss} />
        <StatTile label="Calibration error" value={<span className="num">{fmtPct(perf.calibrationError.value)}</span>} m={perf.calibrationError} />
        <StatTile label="Avg CLV, all" value={<Signed value={perf.avgClv.value}>{fmtSignedPct(perf.avgClv.value)}</Signed>} m={perf.avgClv} />
        <StatTile label="ROI simulation" value={<Signed value={st.roi}>{fmtSignedPct(st.roi)}</Signed>} m={perf.staking} />
        <StatTile label="Max drawdown" value={<span className="num">{st.maxDrawdown.toFixed(1)} u</span>} m={perf.staking} />
        <StatTile label="Profit factor" value={<span className="num">{Number.isFinite(st.profitFactor) ? st.profitFactor.toFixed(2) : "—"}</span>} m={perf.staking} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Simulated equity, tracked opportunities" right="1-unit flat stakes · simulated" className="xl:col-span-2">
          <TimeSeriesChart
            label="Simulated cumulative profit in units"
            series={[{ label: "Cumulative profit (units)", color: "var(--series-3)", points: st.equity.map((p) => ({ t: p.at, v: p.value })) }]}
            format={(v) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(0)}u`}
            markers={VERSION_MARKERS}
            zero
            height={220}
          />
          <div className="border-t border-line px-4 py-2">
            <MetricContextLine m={perf.staking} />
            <p className="mt-1 text-[11px] text-muted">
              {VALUE_RULE_TEXT} Win rate {fmtPct(st.winRate)} over {fmtInt(st.stakes)} simulated stakes. Dashed lines mark model releases. Past simulated results do not predict future results.
            </p>
          </div>
        </Panel>
        <Panel title="Calibration" right="Predicted vs observed">
          <CalibrationChart bins={perf.calibration} />
          <div className="border-t border-line px-4 py-2">
            <MetricContextLine m={perf.calibrationError} />
          </div>
        </Panel>
      </div>

      <Panel title="Breakdown" right={<LinkTabs label="Break down by" active={dim.id} items={DIMENSIONS.map((d) => ({ id: d.id, label: d.label, href: href(d.id, sport) }))} />}>
        <SegmentTable rows={segments} heading={dim.label} total={total} />
        <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
          Historical results from the prediction ledger, {sport === "all" ? "all sports" : SPORTS.find((s) => s.id === sport)?.name}. Segments with fewer than 200 settled predictions are flagged; their figures are shown but should not be read as patterns. Across a whole market the predicted probabilities sum to 100% and exactly one selection wins, so the total bias is zero by construction. Source: ODDSIQ prediction ledger (DEMO DATA).
        </p>
      </Panel>
    </div>
  );
}
