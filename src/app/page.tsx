import Link from "next/link";
import { CalibrationChart } from "@/components/charts/CalibrationChart";
import { Badge, MetricContextLine, PageHeader, Panel, Signed, StatTile, Tip } from "@/components/ui";
import { requestNow } from "@/lib/data";
import { ALERT_TYPES, marketAlerts } from "@/lib/demo/alerts";
import { performanceSummary, VALUE_RULE_TEXT } from "@/lib/demo/performance";
import { marketRows, universeStats, type MarketRow } from "@/lib/demo/store";
import { fmtCountdown, fmtInt, fmtOdds, fmtPct, fmtPp, fmtSignedPct, fmtTime } from "@/lib/format";
import { CLV_METHODOLOGY } from "@/lib/metrics/clv";

function MarketLine({ r, now, right }: { r: MarketRow; now: number; right: React.ReactNode }) {
  return (
    <li>
      <Link href={`/markets/${r.selectionId}`} className="flex items-center justify-between gap-3 px-4 py-2 hover:bg-surface-2">
        <span className="min-w-0">
          <span className="block truncate text-sm">
            {r.selection} <span className="text-muted">· {r.market}</span>
          </span>
          <span className="block truncate text-[11px] text-muted">
            {r.match} · {r.league} · {r.status === "live" ? `LIVE ${r.minute}′` : fmtCountdown(r.kickoff - now)}
          </span>
        </span>
        <span className="shrink-0 text-right text-sm">{right}</span>
      </Link>
    </li>
  );
}

export default async function Dashboard() {
  const now = await requestNow();
  const rows = marketRows(now);
  const pre = rows.filter((r) => r.status === "scheduled");
  const withModel = pre.filter((r) => r.edgePp !== null);
  const perf = performanceSummary(now);
  const stats = universeStats(now);
  const alerts = marketAlerts(now);

  const movers = [...pre].sort((a, b) => Math.abs(b.movement) - Math.abs(a.movement)).slice(0, 6);
  const disagreements = [...withModel].sort((a, b) => Math.abs(b.edgePp!) - Math.abs(a.edgePp!)).slice(0, 6);
  const positive = withModel.filter((r) => r.ev! > 0);
  const top = <T,>(xs: T[], key: (x: T) => number) => [...xs].sort((a, b) => key(b) - key(a))[0];
  const characteristics = [
    { label: "Largest model edge", row: top(positive, (r) => r.edgePp!), value: (r: MarketRow) => fmtPp(r.edgePp) },
    { label: "Strongest model consensus", row: top(positive.filter((r) => r.edgePp! >= 2), (r) => (r.modelDisagreement === "LOW" ? 1000 : 0) + (r.confidence ?? 0)), value: (r: MarketRow) => `${r.modelDisagreement} disagreement` },
    { label: "Largest market movement", row: top(positive, (r) => Math.abs(r.movement)), value: (r: MarketRow) => fmtSignedPct(r.movement) },
    { label: "Highest confidence", row: top(positive.filter((r) => r.edgePp! >= 1), (r) => r.confidence ?? 0), value: (r: MarketRow) => `${r.confidence} / 100` },
    { label: "Highest data quality", row: top(positive.filter((r) => r.edgePp! >= 1), (r) => r.dataQuality.score), value: (r: MarketRow) => `${r.dataQuality.score} / 100` },
    { label: "Highest estimated pressure", row: top(positive, (r) => r.pressure.score), value: (r: MarketRow) => `${r.pressure.score} / 100` },
  ].filter((c) => c.row);

  const liveEvents = new Map<string, MarketRow>();
  for (const r of rows) if (r.status === "live" && r.selectionId.endsWith("-home")) liveEvents.set(r.eventId, r);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        subtitle="Track market movement. Compare probabilities. Understand model disagreement. Measure performance."
        right={
          <span className="text-xs text-muted">
            {fmtInt(rows.length)} markets open · {fmtInt(stats.events)} events tracked · {stats.leagues} leagues · {stats.bookmakers} bookmakers
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Brier score" value={<span className="num">{perf.brier.value.toFixed(3)}</span>} m={perf.brier} />
        <StatTile label="Calibration error" value={<span className="num">{fmtPct(perf.calibrationError.value)}</span>} m={perf.calibrationError} />
        <StatTile label="Avg CLV, all" value={<Signed value={perf.avgClv.value}>{fmtSignedPct(perf.avgClv.value)}</Signed>} m={perf.avgClv} />
        <StatTile label="Avg CLV, opportunities" value={<Signed value={perf.opportunityClv.value}>{fmtSignedPct(perf.opportunityClv.value)}</Signed>} m={perf.opportunityClv} />
        <StatTile label="ROI simulation" value={<Signed value={perf.staking.value.roi}>{fmtSignedPct(perf.staking.value.roi)}</Signed>} m={perf.staking} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Market movement" right="Since opening, pre-match">
          <ul className="divide-y divide-line">
            {movers.map((r) => (
              <MarketLine
                key={r.selectionId}
                r={r}
                now={now}
                right={
                  <>
                    <span className="num text-ink-2">
                      {fmtOdds(r.openingOdds)} → {fmtOdds(r.currentOdds)}
                    </span>
                    <span className="num block text-xs text-ink-2">
                      {fmtSignedPct(r.movement)} · {r.booksMovedSinceOpen}/{r.booksQuoting} books
                    </span>
                  </>
                }
              />
            ))}
          </ul>
        </Panel>

        <Panel title="Model-market disagreement" right="Largest |model − market|">
          <ul className="divide-y divide-line">
            {disagreements.map((r) => (
              <MarketLine
                key={r.selectionId}
                r={r}
                now={now}
                right={
                  <>
                    <Signed value={r.edgePp}>{fmtPp(r.edgePp)}</Signed>
                    <span className="num block text-xs text-muted">
                      mkt {fmtPct(r.marketProbability)} · model {fmtPct(r.modelProbability)}
                    </span>
                  </>
                }
              />
            ))}
          </ul>
        </Panel>

        <Panel title={<Tip text={`Opportunities are grouped by characteristic rather than ranked as a single “best bet”. Each shows positive expected value on the model's current estimate. ${VALUE_RULE_TEXT}`}>Opportunities by characteristic</Tip>}>
          <ul className="divide-y divide-line">
            {characteristics.map((c) => (
              <li key={c.label}>
                <Link href={`/markets/${c.row!.selectionId}`} className="block px-4 py-2 hover:bg-surface-2">
                  <div className="flex justify-between text-[10.5px] uppercase tracking-wider text-muted">
                    <span>{c.label}</span>
                    <span className="num normal-case text-ink-2">{c.value(c.row!)}</span>
                  </div>
                  <div className="mt-0.5 flex justify-between gap-2 text-sm">
                    <span className="truncate">
                      {c.row!.selection} <span className="text-muted">· {c.row!.match}</span>
                    </span>
                    <span className="num shrink-0 text-xs text-ink-2">
                      {fmtOdds(c.row!.bestOdds)} · EV {fmtSignedPct(c.row!.ev)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4">
          <Panel title="Live markets" right={<Badge tone="critical">● {liveEvents.size} in play</Badge>}>
            <ul className="divide-y divide-line">
              {[...liveEvents.values()].map((r) => (
                <li key={r.eventId}>
                  <Link href={`/markets/${r.selectionId}`} className="flex items-center justify-between gap-3 px-4 py-2 hover:bg-surface-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{r.match}</span>
                      <span className="block truncate text-[11px] text-muted">
                        <span className="text-critical">{r.minute}′</span> · {r.league} · home win: market {fmtPct(r.marketProbability, 0)}, model {fmtPct(r.modelProbability, 0)}
                      </span>
                    </span>
                    <span className="num shrink-0 text-lg">
                      {r.score?.home}–{r.score?.away}
                    </span>
                  </Link>
                </li>
              ))}
              {liveEvents.size === 0 && <li className="px-4 py-3 text-sm text-muted">No matches in play right now.</li>}
            </ul>
          </Panel>
          <Panel title="Latest alerts" right={<Link href="/markets/alerts" className="text-accent hover:underline">All alerts →</Link>}>
            <ul className="divide-y divide-line">
              {alerts.slice(0, 5).map((a) => (
                <li key={a.id} className="px-4 py-2">
                  <div className="flex items-center justify-between gap-3 text-[10.5px] uppercase tracking-wider">
                    <span className="text-warning">{ALERT_TYPES.find((t) => t.id === a.type)!.label}</span>
                    <span className="num text-muted">{fmtTime(a.at)}</span>
                  </div>
                  <div className="truncate text-sm">{a.match}</div>
                  <div className="truncate text-[11px] text-muted">{a.headline}</div>
                </li>
              ))}
              {alerts.length === 0 && <li className="px-4 py-3 text-sm text-muted">No alerts in the last 24 hours.</li>}
            </ul>
          </Panel>
        </div>

        <Panel title="Calibration" right={<Link href="/model-lab/ledger" className="text-accent hover:underline">Ledger →</Link>}>
          <CalibrationChart bins={perf.calibration} />
          <MetricContextLine m={perf.calibrationError} className="border-t border-line px-4 py-2" />
        </Panel>

        <Panel title="Model performance by version">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wider text-muted">
                <th className="px-4 py-2 text-left font-medium">Version</th>
                <th className="px-2 py-2 text-right font-medium">n</th>
                <th className="px-2 py-2 text-right font-medium">Brier</th>
                <th className="px-4 py-2 text-right font-medium">
                  <Tip text={CLV_METHODOLOGY}>CLV</Tip>
                </th>
              </tr>
            </thead>
            <tbody>
              {perf.byVersion.map((v) => (
                <tr key={v.versionId} className="border-t border-line/60">
                  <td className="num px-4 py-1.5 text-xs">{v.versionId}</td>
                  <td className="num px-2 py-1.5 text-right text-ink-2">{fmtInt(v.n)}</td>
                  <td className="num px-2 py-1.5 text-right">{v.brier.toFixed(3)}</td>
                  <td className="px-4 py-1.5 text-right">
                    <Signed value={v.clv}>{fmtSignedPct(v.clv)}</Signed>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
            Historical, settled ledger predictions (all selections). Lower Brier is better. <Badge tone="warning">Demo data</Badge>
          </p>
        </Panel>
      </div>

      <p className="text-[11px] leading-relaxed text-muted">
        All performance figures are historical or simulated and computed from the full prediction ledger, not selected examples. Past performance does not guarantee future results. The ROI simulation assumes a 1-unit stake on every tracked opportunity at the recorded price; no stakes were placed.
      </p>
    </div>
  );
}
