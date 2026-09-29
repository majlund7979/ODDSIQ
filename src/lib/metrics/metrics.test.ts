import { describe, expect, it } from "vitest";
import { clv, clvPriceRatio } from "./clv";
import { modelConsensus, predictionConfidence } from "./consensus";
import { marketPressure, oddsVelocity, volatility } from "./movement";
import { devig, impliedProbability, overround } from "./probability";
import { dataQuality } from "./quality";
import { brierScore, calibrationBins, expectedCalibrationError, logLoss } from "./scoring";
import { simulateFlatStakes } from "./staking";
import { disagreementLevel, edgePp, expectedValue, priceChange } from "./value";

const HOUR = 3_600_000;

describe("probability", () => {
  it("converts odds to implied probability", () => {
    expect(impliedProbability(2.05)).toBeCloseTo(0.4878, 4);
    expect(() => impliedProbability(1)).toThrow();
  });

  it("removes the margin so fair probabilities sum to 1", () => {
    const odds = [2.1, 3.4, 3.6];
    expect(overround(odds)).toBeGreaterThan(0);
    const fair = devig(odds);
    expect(fair.reduce((s, p) => s + p, 0)).toBeCloseTo(1, 10);
    expect(fair[0]).toBeGreaterThan(fair[1]);
  });
});

describe("value", () => {
  it("matches the spec example: 48.8% market, 56.2% model at 2.05", () => {
    expect(edgePp(0.562, 0.488)).toBeCloseTo(7.4, 6);
    expect(expectedValue(0.562, 2.05)).toBeCloseTo(0.1521, 4);
    expect(disagreementLevel(7.4)).toBe("HIGH");
    expect(disagreementLevel(-3)).toBe("MODERATE");
    expect(disagreementLevel(1)).toBe("LOW");
  });

  it("computes price change: 2.20 -> 2.02 is -8.18%", () => {
    expect(priceChange(2.2, 2.02)).toBeCloseTo(-0.0818, 4);
  });
});

describe("CLV", () => {
  it("is positive when the recorded price beats the fair closing price", () => {
    // Taken at 2.10, closing fair probability 1/1.92.
    expect(clv(2.1, 1 / 1.92)).toBeCloseTo(0.09375, 5);
    expect(clvPriceRatio(2.1, 1.92)).toBeCloseTo(0.09375, 5);
    expect(clv(1.8, 0.5)).toBeCloseTo(-0.1, 10);
  });
});

describe("scoring", () => {
  it("computes Brier score and log loss", () => {
    const rows = [
      { p: 0.8, y: 1 as const },
      { p: 0.3, y: 0 as const },
    ];
    expect(brierScore(rows)).toBeCloseTo((0.04 + 0.09) / 2, 10);
    expect(logLoss(rows)).toBeCloseTo(-(Math.log(0.8) + Math.log(0.7)) / 2, 10);
    expect(brierScore([{ p: 0.5, y: 1 }])).toBe(0.25);
    expect(Number.isNaN(brierScore([]))).toBe(true);
  });

  it("bins predictions for calibration", () => {
    const rows = [
      { p: 0.15, y: 0 as const },
      { p: 0.12, y: 1 as const },
      { p: 0.85, y: 1 as const },
    ];
    const bins = calibrationBins(rows);
    expect(bins).toHaveLength(2);
    expect(bins[0]).toMatchObject({ n: 2, observedRate: 0.5 });
    expect(expectedCalibrationError(rows)).toBeGreaterThan(0);
  });

  it("gives zero calibration error when predictions match frequencies", () => {
    const rows = [
      { p: 0.5, y: 1 as const },
      { p: 0.5, y: 0 as const },
    ];
    expect(expectedCalibrationError(rows)).toBeCloseTo(0, 10);
  });
});

describe("movement", () => {
  const series = [
    { at: 0, odds: 2.2 },
    { at: 1 * HOUR, odds: 2.1 },
    { at: 2 * HOUR, odds: 2.02 },
  ];

  it("measures odds velocity per hour", () => {
    expect(oddsVelocity(series, 2, 2 * HOUR)).toBeCloseTo(-0.09, 6);
    expect(oddsVelocity(series, 1, 2 * HOUR)).toBeCloseTo(-0.08, 6);
    expect(oddsVelocity([], 1, 0)).toBe(0);
  });

  it("has zero volatility for a straight line of constant returns", () => {
    const flat = [1, 2, 3, 4].map((i) => ({ at: i, odds: 2 }));
    expect(volatility(flat)).toBe(0);
  });

  it("keeps market pressure within 0-100 and marks it estimated without volume", () => {
    const calm = marketPressure({ openOdds: 2, currentOdds: 2, relativeVelocityPerHour: 0, booksMovingWithConsensus: 0, booksQuoting: 10, volatility: 0, baselineVolatility: 0.01, hoursToKickoff: 100 });
    const hot = marketPressure({ openOdds: 2.15, currentOdds: 1.89, relativeVelocityPerHour: -0.03, booksMovingWithConsensus: 10, booksQuoting: 10, volatility: 0.05, baselineVolatility: 0.01, hoursToKickoff: 1 });
    expect(calm.score).toBeLessThan(10);
    expect(calm.level).toBe("NORMAL");
    expect(hot.score).toBeGreaterThanOrEqual(90);
    expect(hot.score).toBeLessThanOrEqual(100);
    expect(hot.level).toBe("HIGH");
    expect(hot.estimated).toBe(true);
    expect(marketPressure({ openOdds: 2, currentOdds: 2, relativeVelocityPerHour: 0, booksMovingWithConsensus: 0, booksQuoting: 10, volatility: 0, baselineVolatility: 0.01, hoursToKickoff: 100, liquidity: 5000 }).estimated).toBe(false);
  });
});

describe("consensus and confidence", () => {
  it("flags model disagreement from the spread between models", () => {
    expect(modelConsensus([0.54, 0.575, 0.55, 0.58]).level).toBe("MODERATE");
    expect(modelConsensus([0.51, 0.59, 0.53, 0.61]).level).toBe("HIGH");
    expect(modelConsensus([0.55, 0.556, 0.552]).level).toBe("LOW");
  });

  it("lowers confidence when models disagree or intervals widen", () => {
    const base = { ciLow: 0.51, ciHigh: 0.61, modelStdevPp: 1, dataQuality: 95 };
    expect(predictionConfidence({ ...base, modelStdevPp: 4 })).toBeLessThan(predictionConfidence(base));
    expect(predictionConfidence({ ...base, ciLow: 0.4, ciHigh: 0.7 })).toBeLessThan(predictionConfidence(base));
  });
});

describe("data quality", () => {
  it("rewards fresh, complete data", () => {
    const now = 10 * HOUR;
    const fresh = dataQuality({ now, oddsUpdatedAt: now - 10_000, statsUpdatedAt: now - 60_000, injuriesUpdatedAt: now - 60_000, lineupConfirmedAt: now - 60_000, hoursToKickoff: 0.5, sourceReliability: 1, booksQuoting: 10, booksTracked: 10 });
    const stale = dataQuality({ now, oddsUpdatedAt: now - 5 * HOUR, hoursToKickoff: 0.5, sourceReliability: 0.8, booksQuoting: 4, booksTracked: 10 });
    expect(fresh.score).toBe(100);
    expect(stale.odds).toBe("Stale");
    expect(stale.lineup).toBe("Expected");
    expect(stale.score).toBeLessThan(40);
  });
});

describe("staking simulation", () => {
  it("tracks profit, drawdown and profit factor", () => {
    const s = simulateFlatStakes([
      { at: 1, odds: 2.5, won: true },
      { at: 2, odds: 2, won: false },
      { at: 3, odds: 2, won: false },
      { at: 4, odds: 3, won: true },
    ]);
    expect(s.profit).toBeCloseTo(1.5, 10);
    expect(s.roi).toBeCloseTo(0.375, 10);
    expect(s.maxDrawdown).toBeCloseTo(2, 10);
    expect(s.profitFactor).toBeCloseTo(3.5 / 2, 10);
    expect(s.winRate).toBe(0.5);
  });
});
