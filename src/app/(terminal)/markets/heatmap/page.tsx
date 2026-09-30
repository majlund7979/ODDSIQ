import Link from "next/link";
import { MarketsNav } from "@/components/MarketsNav";
import { LinkTabs, PageHeader, Panel } from "@/components/ui";
import { clvHistoryBySegment, clvSegmentKey } from "@/lib/demo/analytics";
import { LEAGUES } from "@/lib/demo/catalog";

import { fmtInt, fmtPct, fmtSignedPct } from "@/lib/format";
import { MIN_SAMPLE_FOR_WARNING } from "@/lib/metrics/metric";
import { terminal } from "@/lib/terminal";

export const metadata = { title: "Market Heatmap · ODDSIQ" };

const COLUMNS = [
  { type: "1X2", label: "Match winner (1X2)" },
  { type: "OU25", label: "Total goals 2.5" },
  { type: "BTTS", label: "Both teams to score" },
  { type: "ML", label: "Moneyline / match winner" },
] as const;

const METRICS = [
  { id: "edge", label: "Avg |model − market|", note: "Live · average absolute difference between model and margin-free market probability across open pre-match markets, in percentage points." },
  { id: "share", label: "Share ≥ 3 pp", note: "Live · share of open pre-match selections where the model and market differ by 3 percentage points or more." },
  { id: "clv", label: "Historical CLV", note: "Historical · average closing line value of ledgered predictions in each league and market. Cells below n = 200 are hatched." },
] as const;

export default async function HeatmapPage({ searchParams }: { searchParams: Promise<{ metric?: string }> }) {
  const t = await terminal();
  const { metric: metricId } = await searchParams;
  const metric = METRICS.find((m) => m.id === metricId) ?? METRICS[0];
  const rows = t.marketRows().filter((r) => r.status === "scheduled" && r.edgePp !== null);
  const clv = clvHistoryBySegment(t.ledgerRows());

  const cell = (leagueId: string, type: string): { value: number; n: number } | null => {
    if (metric.id === "clv") {
      const h = clv.get(clvSegmentKey(leagueId, type));
      return h ? { value: h.avg, n: h.n } : null;
    }
    const xs = rows.filter((r) => r.leagueId === leagueId && r.marketType === type);
    if (!xs.length) return null;
    const value = metric.id === "edge" ? xs.reduce((s, r) => s + Math.abs(r.edgePp!), 0) / xs.length : xs.filter((r) => Math.abs(r.edgePp!) >= 3).length / xs.length;
    return { value, n: xs.length };
  };

  const grid = LEAGUES.map((l) => ({ league: l, cells: COLUMNS.map((c) => cell(l.id, c.type)) })).filter((g) => g.cells.some(Boolean));
  const values = grid.flatMap((g) => g.cells.filter((c) => c !== null).map((c) => c!.value));
  const maxAbs = Math.max(...values.map(Math.abs), 1e-9);
  const fmt = (v: number) => (metric.id === "edge" ? `${v.toFixed(1)} pp` : metric.id === "share" ? fmtPct(v, 0) : fmtSignedPct(v));
  const bg = (v: number) => {
    const a = (0.12 + 0.78 * (Math.abs(v) / maxAbs)).toFixed(2);
    if (metric.id === "clv") return `color-mix(in oklab, var(${v >= 0 ? "--good" : "--critical"}) ${Math.round(Number(a) * 100)}%, transparent)`;
    return `color-mix(in oklab, var(--series-model) ${Math.round(Number(a) * 100)}%, transparent)`;
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Market Heatmap" subtitle="Where the model disagrees with the market most, by league and market type." />
      <MarketsNav active="heatmap" />
      <Panel title="Model-market disagreement" right={<LinkTabs label="Colour by" active={metric.id} items={METRICS.map((m) => ({ id: m.id, label: m.label, href: `/markets/heatmap?metric=${m.id}` }))} />}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-separate border-spacing-1 px-3 py-3 text-[12.5px]">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wider text-muted">
                <th className="px-2 py-1 text-left font-medium">League</th>
                {COLUMNS.map((c) => (
                  <th key={c.type} className="px-2 py-1 text-center font-medium">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((g) => (
                <tr key={g.league.id}>
                  <td className="px-2 py-1 whitespace-nowrap">
                    <Link href={`/markets?q=${encodeURIComponent(g.league.name)}`} className="hover:text-accent">
                      {g.league.name}
                    </Link>
                  </td>
                  {g.cells.map((c, i) =>
                    c === null ? (
                      <td key={COLUMNS[i].type} className="rounded px-2 py-2.5 text-center text-muted">
                        ·
                      </td>
                    ) : (
                      <td
                        key={COLUMNS[i].type}
                        className="rounded px-2 py-2.5 text-center"
                        style={{
                          background: bg(c.value),
                          backgroundImage: metric.id === "clv" && c.n < MIN_SAMPLE_FOR_WARNING ? "repeating-linear-gradient(45deg, transparent 0 4px, rgba(0,0,0,.35) 4px 6px)" : undefined,
                        }}
                        title={`${g.league.name} · ${COLUMNS[i].label}: ${fmt(c.value)} · n = ${fmtInt(c.n)}`}
                      >
                        <div className="num text-ink">{fmt(c.value)}</div>
                        <div className="num text-[10px] text-ink-2">n {fmtInt(c.n)}</div>
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
          {metric.note} Colour intensity is relative to the largest cell on this view. Disagreement is not the same as value: the closing market has usually been at least as accurate as the model. {t.dataLabel}.
        </p>
      </Panel>
    </div>
  );
}
