// Probabilistic scoring for binary outcomes (1 = selection won, 0 = lost).

export interface Scored {
  p: number;
  y: 0 | 1;
}

/** Brier = mean((p − y)²). 0 is perfect; 0.25 is a constant 50% guess. Lower is better. */
export function brierScore(rows: Scored[]): number {
  if (rows.length === 0) return NaN;
  return rows.reduce((s, r) => s + (r.p - r.y) ** 2, 0) / rows.length;
}

/** Mean negative log-likelihood (natural log). Lower is better. */
export function logLoss(rows: Scored[], eps = 1e-12): number {
  if (rows.length === 0) return NaN;
  return (
    rows.reduce((s, r) => {
      const p = Math.min(1 - eps, Math.max(eps, r.p));
      return s - (r.y === 1 ? Math.log(p) : Math.log(1 - p));
    }, 0) / rows.length
  );
}

export interface CalibrationBin {
  from: number;
  to: number;
  n: number;
  meanPredicted: number;
  observedRate: number;
}

/** Equal-width reliability bins. Empty bins are omitted. */
export function calibrationBins(rows: Scored[], binCount = 10): CalibrationBin[] {
  const bins = Array.from({ length: binCount }, (_, i) => ({
    from: i / binCount,
    to: (i + 1) / binCount,
    n: 0,
    sumP: 0,
    sumY: 0,
  }));
  for (const r of rows) {
    const i = Math.min(binCount - 1, Math.floor(r.p * binCount));
    bins[i].n++;
    bins[i].sumP += r.p;
    bins[i].sumY += r.y;
  }
  return bins
    .filter((b) => b.n > 0)
    .map((b) => ({ from: b.from, to: b.to, n: b.n, meanPredicted: b.sumP / b.n, observedRate: b.sumY / b.n }));
}

/** Expected calibration error: sample-weighted mean |predicted − observed|. */
export function expectedCalibrationError(rows: Scored[], binCount = 10): number {
  if (rows.length === 0) return NaN;
  return calibrationBins(rows, binCount).reduce(
    (s, b) => s + (b.n / rows.length) * Math.abs(b.meanPredicted - b.observedRate),
    0,
  );
}
