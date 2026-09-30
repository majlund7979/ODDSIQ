import Link from "next/link";
import { MarketsNav } from "@/components/MarketsNav";
import { PageHeader, Panel, Signed, Tip } from "@/components/ui";
import { SPORTS } from "@/lib/demo/catalog";

import { fmtInt, fmtPct, fmtPeriod, fmtSignedPct } from "@/lib/format";
import { periodOf } from "@/lib/metrics/metric";
import { movementSignals, RLM_DEFINITION, SHARP_DEFINITION } from "@/lib/metrics/signals";
import { mean } from "@/lib/metrics/stats";
import { terminal } from "@/lib/terminal";

export const metadata = { title: "Sports Market Overview · ODDSIQ" };

export default async function OverviewPage() {
  const t = await terminal();
  const rows = t.marketRows();
  const ledger = t.ledgerRows().filter((r) => r.clv !== undefined);
  const clvPeriod = periodOf(ledger.map((r) => r.prediction.createdAt));

  const sports = SPORTS.map((s) => {
    const all = rows.filter((r) => r.sportId === s.id);
    const pre = all.filter((r) => r.status === "scheduled");
    const priced = pre.filter((r) => r.modelDisagreement !== null);
    const clv = ledger.filter((r) => r.event.sportId === s.id).map((r) => r.clv!);
    const signals = pre.flatMap((r) => movementSignals(r));
    return {
      sport: s,
      tracked: all.length,
      live: all.filter((r) => r.status === "live").length,
      volatility: mean(pre.map((r) => r.volatility)),
      agreement: priced.length ? priced.filter((r) => r.modelDisagreement === "LOW").length / priced.length : NaN,
      priced: priced.length,
      clv: mean(clv),
      clvN: clv.length,
      discrepancies: priced.filter((r) => Math.abs(r.edgePp!) >= 5).length,
      sharp: signals.filter((x) => x.kind === "SHARP").length,
      rlm: signals.filter((x) => x.kind === "RLM").length,
    };
  });

  const stat = (label: React.ReactNode, value: React.ReactNode) => (
    <div>
      <div className="text-[10.5px] uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className="num mt-0.5 text-lg">{value}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Sports Market Overview" subtitle="Every sport the terminal tracks, side by side: activity, volatility, how much the models agree, and how the model has done against the closing line." />
      <MarketsNav active="overview" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sports.map((s) => (
          <Panel key={s.sport.id} title={s.sport.name} right={<Link href={`/markets?q=${encodeURIComponent(s.sport.name)}`} className="text-accent hover:underline">Open markets →</Link>}>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3 sm:grid-cols-3">
              {stat("Markets tracked", fmtInt(s.tracked))}
              {stat("Live markets", fmtInt(s.live))}
              {stat(<Tip text="Mean standard deviation of hourly log price changes over the last 24 hours, pre-match markets.">Avg volatility</Tip>, Number.isFinite(s.volatility) ? `${(s.volatility * 100).toFixed(2)}%` : "—")}
              {stat(<Tip text="Share of priced pre-match markets where the four component models show LOW disagreement.">Model agreement</Tip>, fmtPct(s.agreement, 0))}
              {stat(
                <Tip text="Historical average closing line value of ledgered predictions in this sport.">Avg CLV</Tip>,
                <Signed value={s.clv}>{fmtSignedPct(s.clv)}</Signed>,
              )}
              {stat(<Tip text="Priced pre-match selections where the model and the margin-free market differ by 5 percentage points or more.">Discrepancies ≥ 5 pp</Tip>, fmtInt(s.discrepancies))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-2 text-[11px] text-muted">
              <span>
                <Tip text={SHARP_DEFINITION}>Sharp movement</Tip> <span className="num text-ink-2">{s.sharp}</span>
              </span>
              <span>
                <Tip text={RLM_DEFINITION}>Reverse line movement</Tip> <span className="num text-ink-2">{s.rlm}</span>
              </span>
              <span>
                Live · {fmtInt(s.priced)} priced · CLV historical n = {fmtInt(s.clvN)}, {fmtPeriod(clvPeriod.periodFrom, clvPeriod.periodTo)}
              </span>
            </div>
          </Panel>
        ))}
      </div>
      <p className="text-[11px] text-muted">Live figures cover markets open now; CLV is historical, from the prediction ledger. {t.dataLabel}.</p>
    </div>
  );
}
