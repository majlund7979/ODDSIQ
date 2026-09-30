import { Ago } from "@/components/Clock";
import { MarketTable } from "@/components/MarketTable";
import { MarketsNav } from "@/components/MarketsNav";
import { Badge, PageHeader, Panel, Tip } from "@/components/ui";

import { toTableRow } from "@/lib/demo/views";
import { DATA_QUALITY_DEFINITION } from "@/lib/metrics/quality";
import { terminal } from "@/lib/terminal";

export const metadata = { title: "Market Terminal · ODDSIQ" };

export default async function MarketsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const t = await terminal();
  const now = t.now;
  const { q } = await searchParams;
  const rows = t.marketRows();
  const lastUpdate = Math.max(...rows.map((r) => r.lastUpdate), t.feedTime);
  const dq = Math.round(rows.reduce((s, r) => s + r.dataQuality.score, 0) / Math.max(rows.length, 1));
  const live = rows.filter((r) => r.status === "live").length;
  const withModel = rows.filter((r) => r.edgePp !== null && !r.inPlayModel);
  const highPressure = rows.filter((r) => r.pressure.level === "HIGH").length;
  const disagreements = withModel.filter((r) => Math.abs(r.edgePp!) >= 5).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Market Terminal"
        subtitle="What the market is doing, what the model thinks, and where the two disagree."
        right={
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="text-good">●</span> <span className="text-ink">LIVE DATA</span> {!t.live && <Badge tone="warning">Demo feed</Badge>}
            </span>
            <span>
              Last update <span className="text-ink"><Ago at={lastUpdate} /></span>
            </span>
            <span>
              <Tip text={DATA_QUALITY_DEFINITION}>Data quality</Tip> <span className="num text-ink">{dq}%</span>
            </span>
          </div>
        }
      />
      <MarketsNav active="terminal" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Markets tracked", rows.length],
          ["Live markets", live],
          ["Disagreement ≥ 5 pp", disagreements],
          ["High estimated pressure", highPressure],
        ].map(([label, v]) => (
          <div key={label} className="rounded-md border border-line bg-surface px-4 py-2.5">
            <div className="text-[10.5px] uppercase tracking-[0.12em] text-muted">{label}</div>
            <div className="num mt-0.5 text-xl">{v}</div>
          </div>
        ))}
      </div>
      <Panel title="Markets" right="Click a match for chart, model consensus and data sources">
        <MarketTable rows={rows.map(toTableRow)} now={now} initialQuery={q ?? ""} />
      </Panel>
    </div>
  );
}
