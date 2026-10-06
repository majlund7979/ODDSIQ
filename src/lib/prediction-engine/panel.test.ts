import { describe, expect, it } from "vitest";
import { BACKTEST, shapeMatches, shapeModel, shapeRuns, statusOf, type PredictionRow } from "./panel";

const t = (h: number) => new Date(Date.UTC(2026, 9, 10, h));

function row(over: Partial<PredictionRow>): PredictionRow {
  return {
    match_id: "1", kickoff: t(18), competition: "Premier League", home: "Arsenal", away: "Chelsea",
    market: "1x2", line: null, selection: "home", probability: 0.5, raw_probability: 0.47, market_probability: 0.5,
    best_odds: 2.05, best_book: "bet365", model_version: "ens-20261006-abc1234", stage: "early", data_as_of: t(5),
    odds: 2.05, edge: 0, ev: 0.025, ev_low: -0.04, confidence: 50, is_bet: false,
    rejected_because: "EV negativ ved usikkerhed; ingen dokumenteret edge i liga/marked", stake_share: 0,
    ...over,
  };
}

describe("modelpanel", () => {
  it("groups selections per match in 1, X, 2, over, under order and sorts matches by kickoff", () => {
    const rows = [
      row({ match_id: "2", kickoff: t(20), home: "Leeds", away: "Fulham", selection: "away" }),
      row({ selection: "under", market: "ou", line: 2.5 }),
      row({ selection: "away" }),
      row({ selection: "draw" }),
      row({ selection: "home", data_as_of: t(14), stage: "pre_lineup" }),
      row({ selection: "yes", market: "btts" }),
    ];
    const m = shapeMatches(rows);
    expect(m.map((x) => x.matchId)).toEqual(["1", "2"]);
    expect(m[0].selections.map((s) => s.selection)).toEqual(["home", "draw", "away", "under"]);
    expect(m[0].stage).toBe("pre_lineup");
    expect(m[0].dataAsOf).toEqual(t(14));
    expect(m[0].selections[0]).toMatchObject({ p: 0.5, pModel: 0.47, odds: 2.05, isBet: false });
  });

  it("reads run summaries, also skipped and failed runs", () => {
    const runs = shapeRuns([
      { id: "3", started_at: t(5), finished_at: t(6), status: "ok", model_version: "v",
        summary: { matches: 10, predictions: 50, approved_bets: 0, seconds: 340, unmapped_names: ["Celta de Vigo II"] } },
      { id: "2", started_at: t(4), finished_at: t(4), status: "skipped", model_version: null,
        summary: { upcoming_mapped: 0, why: "no upcoming matches in covered leagues" } },
      { id: "1", started_at: t(3), finished_at: t(3), status: "failed", model_version: null, summary: { error: "OperationalError: x" } },
    ]);
    expect(runs[0]).toMatchObject({ matches: 10, predictions: 50, approved: 0, seconds: 340, unmapped: ["Celta de Vigo II"] });
    expect(runs[1]).toMatchObject({ status: "skipped", matches: 0, note: "no upcoming matches in covered leagues" });
    expect(runs[2]).toMatchObject({ status: "failed", note: "OperationalError: x", predictions: null });
  });

  it("colours the status by whether the model beats the market", () => {
    const base = { version: "v", status: "shadow", created_at: t(5), train: [2022, 2023, 2024], validate: 2025, weights: { elo: 0.4, rf: 0.6 } };
    const red = shapeModel({ ...base, blend_1x2: 0, blend_ou25: 0,
      validation: { matches: 1800, log_loss_model_1x2: 1.0086, log_loss_market_1x2: 0.9951 } });
    expect(red).toMatchObject({ validate: 2025, blend1x2: 0, train: [2022, 2023, 2024], validation: { matches: 1800 } });
    expect(statusOf(red).tone).toBe("critical");
    expect(statusOf({ ...red!, blend1x2: 0.2 }).tone).toBe("warning");
    expect(statusOf({ ...red!, validation: { matches: 1800, model: 0.99, market: 0.9951 } }).tone).toBe("good");
    expect(statusOf(null).tone).toBe("neutral");
  });

  it("gives every backtest number its sample, period, source and model version", () => {
    for (const b of BACKTEST) {
      expect(b.m.n).toBeGreaterThan(0);
      expect(b.m.periodFrom).not.toBeNull();
      expect(b.m.source).toMatch(/football-data/);
      expect(b.m.modelVersion).toBeTruthy();
      expect(["historical", "simulated"]).toContain(b.m.basis);
    }
  });
});
