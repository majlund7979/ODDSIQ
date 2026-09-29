import type { LiveEvent } from "@/lib/domain/types";
import { fmtPct } from "@/lib/format";

interface Point {
  minute: number;
  model: number;
  market: number;
}

/** In-play probability movement for one selection, with goals and red cards marked. */
export function InPlayChart({ points, events }: { points: Point[]; events: LiveEvent[] }) {
  const W = 600;
  const H = 180;
  const pad = { l: 36, r: 12, t: 12, b: 22 };
  const maxMin = Math.max(95, points.at(-1)?.minute ?? 0);
  const x = (m: number) => pad.l + (m / maxMin) * (W - pad.l - pad.r);
  const y = (p: number) => pad.t + (1 - p) * (H - pad.t - pad.b);
  const path = (key: "model" | "market") => points.map((p, i) => `${i ? "L" : "M"}${x(p.minute).toFixed(1)},${y(p[key]).toFixed(1)}`).join("");
  const key = events.filter((e) => e.kind === "goal" || e.kind === "red");
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="In-play probability, model versus market">
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <g key={p}>
            <line x1={pad.l} x2={W - pad.r} y1={y(p)} y2={y(p)} stroke="var(--grid)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(p) + 3} textAnchor="end" fontSize={10} fill="var(--muted)" className="num">
              {p * 100}%
            </text>
          </g>
        ))}
        {[0, 15, 30, 45, 60, 75, 90].map((m) => (
          <text key={m} x={x(m)} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--muted)" className="num">
            {m}′
          </text>
        ))}
        {key.map((e, i) => (
          <g key={i}>
            <line x1={x(e.minute)} x2={x(e.minute)} y1={pad.t} y2={H - pad.b} stroke="var(--warning)" strokeDasharray="3 3" strokeWidth={1} />
            <title>{`${e.minute}′ ${e.description}${e.modelBefore != null ? `: ${fmtPct(e.modelBefore, 0)} → ${fmtPct(e.modelAfter, 0)}` : ""}`}</title>
          </g>
        ))}
        <path d={path("market")} fill="none" stroke="var(--series-market)" strokeWidth={2} />
        <path d={path("model")} fill="none" stroke="var(--series-model)" strokeWidth={2} />
      </svg>
      <figcaption className="flex gap-4 px-1 text-[11px] text-ink-2">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-market" /> Market implied
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-model" /> Model
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-px bg-warning" /> Goal / red card
        </span>
      </figcaption>
    </figure>
  );
}
