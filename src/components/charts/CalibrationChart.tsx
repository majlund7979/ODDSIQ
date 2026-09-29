import type { CalibrationBin } from "@/lib/metrics/scoring";
import { fmtInt, fmtPct } from "@/lib/format";

/** Reliability diagram: predicted probability vs observed frequency, with the perfect-calibration diagonal. */
export function CalibrationChart({ bins }: { bins: CalibrationBin[] }) {
  const S = 220;
  const pad = 28;
  const x = (p: number) => pad + p * (S - pad - 8);
  const y = (p: number) => S - pad - p * (S - pad - 8);
  const maxN = Math.max(...bins.map((b) => b.n), 1);
  return (
    <figure className="px-4 py-3">
      <svg viewBox={`0 0 ${S} ${S}`} className="mx-auto h-auto w-full max-w-[280px]" role="img" aria-label="Calibration curve">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={x(0)} x2={x(1)} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
            <text x={pad - 4} y={y(t) + 3} fontSize={9} textAnchor="end" fill="var(--muted)" className="num">
              {t * 100}
            </text>
            <text x={x(t)} y={S - pad + 12} fontSize={9} textAnchor="middle" fill="var(--muted)" className="num">
              {t * 100}
            </text>
          </g>
        ))}
        <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="var(--muted)" strokeDasharray="4 4" />
        <path d={bins.map((b, i) => `${i ? "L" : "M"}${x(b.meanPredicted)},${y(b.observedRate)}`).join("")} fill="none" stroke="var(--series-model)" strokeWidth={2} />
        {bins.map((b) => (
          <circle key={b.from} cx={x(b.meanPredicted)} cy={y(b.observedRate)} r={3 + 3 * Math.sqrt(b.n / maxN)} fill="var(--series-model)" stroke="var(--surface)" strokeWidth={2}>
            <title>{`Predicted ${fmtPct(b.meanPredicted)} · observed ${fmtPct(b.observedRate)} · n = ${fmtInt(b.n)}`}</title>
          </circle>
        ))}
      </svg>
      <figcaption className="mt-1 flex justify-center gap-4 text-[11px] text-ink-2">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-model" /> ODDSIQ model
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0 w-4 border-t border-dashed border-muted" /> Perfect calibration
        </span>
        <span className="text-muted">x: predicted % · y: observed %</span>
      </figcaption>
    </figure>
  );
}
