// Model consensus and prediction confidence. No single model is shown without
// the spread across models, and disagreement lowers confidence automatically.

export interface ConsensusSummary {
  mean: number;
  min: number;
  max: number;
  stdevPp: number;
  level: "LOW" | "MODERATE" | "HIGH";
}

export function modelConsensus(probabilities: number[]): ConsensusSummary {
  const n = probabilities.length;
  if (n === 0) return { mean: NaN, min: NaN, max: NaN, stdevPp: NaN, level: "LOW" };
  const mean = probabilities.reduce((s, p) => s + p, 0) / n;
  const variance = n > 1 ? probabilities.reduce((s, p) => s + (p - mean) ** 2, 0) / (n - 1) : 0;
  const stdevPp = Math.sqrt(variance) * 100;
  return {
    mean,
    min: Math.min(...probabilities),
    max: Math.max(...probabilities),
    stdevPp,
    level: stdevPp >= 3 ? "HIGH" : stdevPp >= 1.5 ? "MODERATE" : "LOW",
  };
}

export function predictionConfidence(input: { ciLow: number; ciHigh: number; modelStdevPp: number; dataQuality: number }): number {
  const ciWidthPp = (input.ciHigh - input.ciLow) * 100;
  const raw = 100 - 2 * ciWidthPp - 4 * input.modelStdevPp - 0.5 * (100 - input.dataQuality);
  return Math.round(Math.max(5, Math.min(95, raw)));
}
