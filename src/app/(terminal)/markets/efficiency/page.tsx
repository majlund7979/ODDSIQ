import { MarketsNav } from "@/components/MarketsNav";
import { Badge, LinkTabs, PageHeader, Panel, Signed, Tip } from "@/components/ui";
import { DEMO_MODE, requestNow } from "@/lib/data";
import { DemoOnly } from "@/components/DemoOnly";
import { accuracyByHorizon, bookmakerEfficiency, EFFICIENCY_DEFINITION, EFFICIENCY_DIMS, efficiencyBy, type EfficiencyRow } from "@/lib/demo/efficiency";
import { settledSelections } from "@/lib/demo/store";
import { fmtInt, fmtPct, fmtPeriod, fmtSignedPct } from "@/lib/format";
import { MIN_SAMPLE_FOR_WARNING, periodOf } from "@/lib/metrics/metric";

export const metadata = { title: "Market Efficiency · ODDSIQ" };

const th = "px-2.5 py-2 font-medium";

export default async function EfficiencyPage({ searchParams }: { searchParams: Promise<{ by?: string }> }) {
  if (!DEMO_MODE) return <DemoOnly title="Market Efficiency" needs="several months of closing lines per bookmaker" />;
  const now = await requestNow();
  const { by } = await searchParams;
  const { dim, rows, total } = efficiencyBy(now, by);
  const horizons = accuracyByHorizon(now);
  const books = bookmakerEfficiency(now);
  const period = periodOf(settledSelections(now).map((s) => s.kickoff));
  const all = [...rows, total];

  return (
    <div className="space-y-4">
      <PageHeader title="Market Efficiency" subtitle="How well closing prices have forecast results, how late information arrives, and how far the model has sat from the market, across settled markets." />
      <MarketsNav active="efficiency" />

      <Panel title="Efficiency by segment" right={<LinkTabs label="Segment by" active={dim.id} items={EFFICIENCY_DIMS.map((d) => ({ id: d.id, label: d.label, href: `/markets/efficiency?by=${d.id}` }))} />}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-[10.5px] uppercase tracking-wider text-muted">
                <th className={`${th} pl-4 text-left`}>{dim.label}</th>
                <th className={`${th} text-right`}>n</th>
                <th className={`${th} text-right`}>
                  <Tip text="Brier score of the margin-free closing price, and its skill relative to each selection type's historical win rate.">Closing Brier / skill</Tip>
                </th>
                <th className={`${th} text-right`}>
                  <Tip text="Average absolute change in market probability from opening to close: historical volatility of the price.">Open → close move</Tip>
                </th>
                <th className={`${th} text-right`}>
                  <Tip text="Average absolute change in market probability over the last 6 hours before kickoff.">Late move</Tip>
                </th>
                <th className={`${th} text-right`}>
                  <Tip text="From the prediction ledger: average absolute difference between the model and the margin-free market when each prediction was recorded.">Model − market</Tip>
                </th>
                <th className={`${th} text-right`}>Avg CLV</th>
                <th className={`${th} pr-4 text-right`}>
                  <Tip text={EFFICIENCY_DEFINITION}>Efficiency score</Tip>
                </th>
              </tr>
            </thead>
            <tbody>
              {all.map((r: EfficiencyRow) => (
                <tr key={r.key} className={`border-b border-line/60 ${r === total ? "bg-surface-2 font-medium" : ""}`}>
                  <td className="px-2.5 py-2 pl-4">
                    {r.label}
                    {r.n < MIN_SAMPLE_FOR_WARNING && (
                      <Badge tone="warning" className="ml-2">
                        n &lt; {MIN_SAMPLE_FOR_WARNING}
                      </Badge>
                    )}
                  </td>
                  <td className="num px-2.5 py-2 text-right">{fmtInt(r.n)}</td>
                  <td className="num px-2.5 py-2 text-right">
                    {r.closingBrier.toFixed(3)} <span className="text-muted">/ {fmtPct(r.closingSkill)}</span>
                  </td>
                  <td className="num px-2.5 py-2 text-right text-ink-2">{r.openToCloseMovePp.toFixed(2)} pp</td>
                  <td className="num px-2.5 py-2 text-right text-ink-2">{r.lateMovePp.toFixed(2)} pp</td>
                  <td className="num px-2.5 py-2 text-right text-ink-2">
                    {Number.isFinite(r.modelMarketDiffPp) ? `${r.modelMarketDiffPp.toFixed(2)} pp` : "—"}
                    <span className="ml-1 text-[10.5px] text-muted">n {fmtInt(r.ledgerN)}</span>
                  </td>
                  <td className="num px-2.5 py-2 text-right">
                    <Signed value={r.avgClv}>{fmtSignedPct(r.avgClv)}</Signed>
                    <span className="ml-1 text-[10.5px] text-muted">n {fmtInt(r.clvN)}</span>
                  </td>
                  <td className="num px-2.5 py-2 pr-4 text-right">
                    <span className="inline-block w-8">{r.score}</span>
                    <span className="ml-2 inline-block h-1.5 w-16 rounded bg-surface-3 align-middle">
                      <span className="block h-1.5 rounded bg-accent" style={{ width: `${r.score}%` }} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-4 py-2 text-[11px] leading-relaxed text-muted">
          Historical · settled markets {fmtPeriod(period.periodFrom, period.periodTo)} · source: tracked bookmakers and ODDSIQ prediction ledger (DEMO DATA). {EFFICIENCY_DEFINITION}
        </p>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Market accuracy by time to kickoff" right="Margin-free consensus">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-[10.5px] uppercase tracking-wider text-muted">
                <th className={`${th} pl-4 text-left`}>Before kickoff</th>
                <th className={`${th} text-right`}>n</th>
                <th className={`${th} text-right`}>Brier</th>
                <th className={`${th} pr-4 text-right`}>Skill</th>
              </tr>
            </thead>
            <tbody>
              {horizons.map((h) => (
                <tr key={h.hours} className="border-b border-line/60">
                  <td className="px-2.5 py-2 pl-4">{h.hours === 0 ? "Close (kickoff)" : h.hours === 168 ? "Opening (7 days)" : `${h.hours} hour${h.hours === 1 ? "" : "s"}`}</td>
                  <td className="num px-2.5 py-2 text-right">{fmtInt(h.n)}</td>
                  <td className="num px-2.5 py-2 text-right">{h.brier.toFixed(4)}</td>
                  <td className="num px-2.5 py-2 pr-4 text-right text-ink-2">{fmtPct(h.skill, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-line px-4 py-2 text-[11px] text-muted">Historical · the same settled selections at each point in time. Lower Brier means prices closer to how results turned out; the gain from opening to close is the information the market absorbed during the week.</p>
        </Panel>
        <Panel title="Bookmakers" right="Own closing prices, margin removed">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-[10.5px] uppercase tracking-wider text-muted">
                <th className={`${th} pl-4 text-left`}>Bookmaker</th>
                <th className={`${th} text-right`}>n</th>
                <th className={`${th} text-right`}>Brier</th>
                <th className={`${th} text-right`}>Avg margin</th>
                <th className={`${th} pr-4 text-right`}>
                  <Tip text="Average absolute gap between the bookmaker's de-vigged closing probability and the consensus.">Gap to consensus</Tip>
                </th>
              </tr>
            </thead>
            <tbody>
              {books.map((b) => (
                <tr key={b.bookmakerId} className="border-b border-line/60">
                  <td className="px-2.5 py-2 pl-4">{b.name}</td>
                  <td className="num px-2.5 py-2 text-right">{fmtInt(b.n)}</td>
                  <td className="num px-2.5 py-2 text-right">{b.closingBrier.toFixed(4)}</td>
                  <td className="num px-2.5 py-2 text-right text-ink-2">{fmtPct(b.avgMargin)}</td>
                  <td className="num px-2.5 py-2 pr-4 text-right text-ink-2">{b.deviationPp.toFixed(2)} pp</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-line px-4 py-2 text-[11px] text-muted">Historical · bookmakers are fictional in DEMO_MODE. No efficiency score is given per bookmaker, because its late-stability part is a market-wide measure.</p>
        </Panel>
      </div>
    </div>
  );
}
