// Small statistical helpers for significance and drift checks.

/** Standard normal CDF (Abramowitz–Stegun 7.1.26, |error| < 1.5e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/** Inverse standard normal CDF (Acklam's rational approximation). */
export function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) return -normalQuantile(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Two-sided p-value for a z statistic. */
export function twoSidedP(z: number): number {
  return 2 * (1 - normalCdf(Math.abs(z)));
}

/**
 * Bonferroni-corrected two-sided critical z for `tests` simultaneous tests at
 * family-wise error rate `alpha`. Scanning many segments guarantees some look
 * unusual by chance; this is the bar a segment must clear to be reported.
 */
export function bonferroniZ(tests: number, alpha = 0.05): number {
  return normalQuantile(1 - alpha / (2 * Math.max(1, tests)));
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN;
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

/** Welch's z-approximation for the difference in means of two samples (b − a). */
export function meanDiffZ(a: number[], b: number[]): number {
  if (a.length < 2 || b.length < 2) return NaN;
  const se = Math.sqrt(stdev(a) ** 2 / a.length + stdev(b) ** 2 / b.length);
  return se > 0 ? (mean(b) - mean(a)) / se : 0;
}

/**
 * Population Stability Index between two samples of probabilities, over equal
 * width bins. < 0.10 stable, 0.10–0.25 moderate shift, > 0.25 large shift.
 */
export function psi(expected: number[], actual: number[], bins = 10): number {
  if (!expected.length || !actual.length) return NaN;
  const hist = (xs: number[]) => {
    const h = new Array(bins).fill(0);
    for (const x of xs) h[Math.min(bins - 1, Math.max(0, Math.floor(x * bins)))]++;
    // Small floor so empty bins do not produce infinities.
    return h.map((c) => Math.max(c / xs.length, 1e-4));
  };
  const e = hist(expected);
  const a = hist(actual);
  return e.reduce((s, ei, i) => s + (a[i] - ei) * Math.log(a[i] / ei), 0);
}

export const PSI_LEVELS = { moderate: 0.1, large: 0.25 };
