import { Badge, levelTone } from "@/components/ui";
import { fmtPct, fmtPp } from "@/lib/format";
import { modelConsensus } from "@/lib/metrics/consensus";

interface Row {
  label: string;
  probability: number;
  ciLow?: number;
  ciHigh?: number;
  kind: "component" | "ensemble" | "market";
}

/**
 * Model consensus as a dot plot on one shared probability axis, so the spread
 * between models is visible and no single model dominates the view.
 */
export function ConsensusStrip({ rows, market }: { rows: Row[]; market: number }) {
  const components = rows.filter((r) => r.kind === "component");
  const ensemble = rows.find((r) => r.kind === "ensemble");
  const cons = modelConsensus(components.map((r) => r.probability));
  const all = [...rows.map((r) => r.ciLow ?? r.probability), ...rows.map((r) => r.ciHigh ?? r.probability), market];
  const lo = Math.max(0, Math.floor((Math.min(...all) - 0.03) * 20) / 20);
  const hi = Math.min(1, Math.ceil((Math.max(...all) + 0.03) * 20) / 20);
  const x = (p: number) => ((p - lo) / (hi - lo)) * 100;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + 1e-9; t += 0.05) ticks.push(Math.round(t * 100) / 100);
  const ordered = [...rows, { label: "Market", probability: market, kind: "market" as const }];

  return (
    <div className="px-4 py-3">
      <div className="space-y-1.5">
        {ordered.map((r) => (
          <div key={r.label} className="grid grid-cols-[88px_1fr_56px] items-center gap-3 text-xs">
            <span className={r.kind === "ensemble" ? "font-semibold text-ink" : r.kind === "market" ? "text-market" : "text-ink-2"}>{r.label}</span>
            <div className="relative h-5">
              {ticks.map((t) => (
                <span key={t} aria-hidden className="absolute top-0 h-5 w-px bg-[var(--grid)]" style={{ left: `${x(t)}%` }} />
              ))}
              {r.kind !== "market" && "ciLow" in r && r.ciLow != null && r.ciHigh != null && (
                <span className="absolute top-1/2 h-[2px] -translate-y-1/2 rounded bg-ink-2/60" style={{ left: `${x(r.ciLow)}%`, width: `${x(r.ciHigh) - x(r.ciLow)}%` }} />
              )}
              <span
                title={`${r.label}: ${fmtPct(r.probability)}`}
                className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--surface)] ${
                  r.kind === "market" ? "bg-market" : r.kind === "ensemble" ? "bg-model" : "bg-ink-2"
                }`}
                style={{ left: `${x(r.probability)}%` }}
              />
            </div>
            <span className="num text-right text-ink">{fmtPct(r.probability)}</span>
          </div>
        ))}
        <div className="grid grid-cols-[88px_1fr_56px] gap-3">
          <span />
          <div className="relative h-4 text-[10px] text-muted">
            {ticks.map((t) => (
              <span key={t} className="num absolute -translate-x-1/2" style={{ left: `${x(t)}%` }}>
                {Math.round(t * 100)}%
              </span>
            ))}
          </div>
          <span />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5 text-xs text-ink-2">
        <span>
          Consensus edge <span className="num">{ensemble ? fmtPp((ensemble.probability - market) * 100) : "—"}</span> · spread{" "}
          <span className="num">{fmtPct(cons.min)}–{fmtPct(cons.max)}</span> · σ <span className="num">{cons.stdevPp.toFixed(1)} pp</span>
        </span>
        <span className="flex items-center gap-2 text-muted">
          Model disagreement <Badge tone={levelTone(cons.level)}>{cons.level}</Badge>
        </span>
      </div>
    </div>
  );
}
