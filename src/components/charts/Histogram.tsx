import { fmtInt } from "@/lib/format";
import type { HistogramBin } from "@/lib/demo/analytics";

/** Vertical bar histogram with an optional reference line (for example zero). */
export function Histogram({ bins, format, reference, label, width = 720 }: { bins: HistogramBin[]; format: (v: number) => string; reference?: number; label: string; width?: number }) {
  const W = width;
  const H = 180;
  const pad = { l: 44, r: 12, t: 10, b: 24 };
  const max = Math.max(...bins.map((b) => b.n), 1);
  const from = bins[0]?.from ?? 0;
  const to = bins.at(-1)?.to ?? 1;
  const x = (v: number) => pad.l + ((v - from) / (to - from)) * (W - pad.l - pad.r);
  const y = (n: number) => pad.t + (1 - n / max) * (H - pad.t - pad.b);
  const labelEvery = Math.max(1, Math.ceil(bins.length / (W < 600 ? 6 : 10)));
  return (
    <figure className="px-3 py-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(f * max)} y2={y(f * max)} stroke="var(--grid)" />
            <text x={pad.l - 6} y={y(f * max) + 3} fontSize={10} textAnchor="end" fill="var(--muted)" className="num">
              {fmtInt(Math.round(f * max))}
            </text>
          </g>
        ))}
        {bins.map((b, i) => {
          const positive = reference !== undefined && b.from >= reference;
          return (
            <g key={b.from}>
              <rect x={x(b.from) + 1} y={y(b.n)} width={Math.max(1, x(b.to) - x(b.from) - 2)} height={H - pad.b - y(b.n)} rx={1.5} fill={positive ? "var(--series-3)" : "var(--series-market)"} opacity={0.85}>
                <title>{`${format(b.from)} to ${format(b.to)} · n = ${fmtInt(b.n)}`}</title>
              </rect>
              {i % labelEvery === 0 && (
                <text x={x(b.from)} y={H - 6} fontSize={10} textAnchor="middle" fill="var(--muted)" className="num">
                  {format(b.from)}
                </text>
              )}
            </g>
          );
        })}
        {reference !== undefined && reference > from && reference < to && <line x1={x(reference)} x2={x(reference)} y1={pad.t} y2={H - pad.b} stroke="var(--text-2)" strokeWidth={1.5} />}
      </svg>
    </figure>
  );
}
