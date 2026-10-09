// Every aggregate statistic shown in the product carries its context, so the
// UI can never render a bare number without sample size, period and source.

export interface MetricContext {
  n: number;
  periodFrom: number | null;
  periodTo: number | null;
  /** Model version(s) the metric covers, or null when not model-specific. */
  modelVersion: string | null;
  source: string;
  /** Plain-language definition of what was measured. */
  definition: string;
  /** historical = realised ledger results; simulated = hypothetical staking; live = current state. */
  basis: "historical" | "simulated" | "live" | "estimated";
}

export interface Metric<T = number> extends MetricContext {
  value: T;
}

export function metric<T>(value: T, ctx: MetricContext): Metric<T> {
  return { value, ...ctx };
}

export function periodOf(timestamps: number[]): { periodFrom: number | null; periodTo: number | null } {
  if (timestamps.length === 0) return { periodFrom: null, periodTo: null };
  let min = Infinity;
  let max = -Infinity;
  for (const t of timestamps) {
    if (t < min) min = t;
    if (t > max) max = t;
  }
  return { periodFrom: min, periodTo: max };
}
