import { Badge, levelTone } from "@/components/ui";
import { fmtPct, fmtPp } from "@/lib/format";
import { disagreementLevel } from "@/lib/metrics/value";

/** Horizontal probability bars: market vs model, with the model's uncertainty range. */
export function ModelVsMarket({ market, model, ciLow, ciHigh }: { market: number; model: number | null; ciLow: number | null; ciHigh: number | null }) {
  const scale = (p: number) => `${Math.min(100, p * 100)}%`;
  const diff = model == null ? null : (model - market) * 100;
  const level = diff == null ? null : disagreementLevel(diff);
  return (
    <div className="space-y-3 px-4 py-3">
      <div>
        <div className="mb-1 flex justify-between text-[11px] uppercase tracking-wider text-muted">
          <span>Market</span>
          <span className="num text-ink">{fmtPct(market)}</span>
        </div>
        <div className="h-3 rounded-sm bg-surface-3" title={`Market probability ${fmtPct(market)}`}>
          <div className="h-3 rounded-sm bg-market" style={{ width: scale(market) }} />
        </div>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-[11px] uppercase tracking-wider text-muted">
          <span>ODDSIQ model</span>
          <span className="num text-ink">
            {fmtPct(model)}
            {ciLow != null && ciHigh != null && <span className="ml-2 text-muted normal-case">range {fmtPct(ciLow, 0)}–{fmtPct(ciHigh, 0)}</span>}
          </span>
        </div>
        <div className="relative h-3 rounded-sm bg-surface-3" title={model == null ? "No prediction yet" : `Model ${fmtPct(model)}, uncertainty ${fmtPct(ciLow, 0)}–${fmtPct(ciHigh, 0)}`}>
          {model != null && <div className="h-3 rounded-sm bg-model" style={{ width: scale(model) }} />}
          {ciLow != null && ciHigh != null && (
            <div className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded bg-ink/70" style={{ left: scale(ciLow), width: `${(ciHigh - ciLow) * 100}%` }} />
          )}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-line pt-2.5 text-xs">
        <span className="text-ink-2">
          Difference <span className={`num ${diff == null ? "" : diff > 0 ? "text-good" : "text-critical"}`}>{fmtPp(diff)}</span>
        </span>
        {level && (
          <span className="flex items-center gap-2 text-muted">
            Model-market disagreement <Badge tone={levelTone(level)}>{level}</Badge>
          </span>
        )}
      </div>
    </div>
  );
}
