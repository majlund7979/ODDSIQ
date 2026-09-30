import { describe, expect, it } from "vitest";
import { Rng } from "@/lib/demo/rng";
import { backtest } from "./backtest";
import { EPL_RESULTS_CSV } from "./data/epl-2021-2026";
import { fitOrderedLogit, newElo, outcomeProbs, updateElo } from "./elo";
import { forecastMatch } from "./ensemble";
import { parseResultsCsv, parseSeason, recentSeasons, seasonOf, type HistMatch } from "./openfootball";
import { fitPoisson, forecastGoals } from "./poisson";
import { matchTeam, teamKey } from "./teams";

const DAY = 86_400_000;
const epl = parseResultsCsv("en.1", EPL_RESULTS_CSV);

describe("team matching", () => {
  it("matches spellings across sources", () => {
    const hist = ["Brighton & Hove Albion FC", "Manchester City FC", "Manchester United FC", "Wolverhampton Wanderers FC", "Nottingham Forest FC", "AFC Bournemouth", "Tottenham Hotspur FC"];
    expect(matchTeam("Brighton and Hove Albion", hist)).toBe("Brighton & Hove Albion FC");
    expect(matchTeam("Manchester United", hist)).toBe("Manchester United FC");
    expect(matchTeam("Bournemouth", hist)).toBe("AFC Bournemouth");
    expect(matchTeam("Wolverhampton Wanderers", hist)).toBe("Wolverhampton Wanderers FC");
    expect(matchTeam("Manchester", hist)).toBeNull();
    expect(matchTeam("Real Madrid", hist)).toBeNull();
  });

  it("handles accents, abbreviations and known aliases", () => {
    expect(teamKey("Bor. Mönchengladbach")).toBe(teamKey("Borussia Monchengladbach"));
    expect(teamKey("FC Bayern München")).toBe(teamKey("Bayern Munich"));
    expect(teamKey("FC Internazionale Milano")).toBe(teamKey("Inter Milan"));
    expect(teamKey("Club Atlético de Madrid")).toBe(teamKey("Atletico Madrid"));
    expect(teamKey("1. FSV Mainz 05")).toBe(teamKey("FSV Mainz 05"));
  });
});

describe("results source", () => {
  it("keeps only played matches", () => {
    const rows = parseSeason("en.1", "2026-27", {
      matches: [
        { date: "2026-08-21", team1: "A", team2: "B", score: { ft: [3, 0] } },
        { date: "2026-10-03", team1: "C", team2: "D" },
        { date: "2026-10-04", team1: "E", team2: "F", score: [] },
      ],
    });
    expect(rows.map((r) => [r.home, r.hg, r.ag])).toEqual([["A", 3, 0]]);
  });

  it("names seasons from July", () => {
    expect(seasonOf(Date.parse("2026-09-30"))).toBe("2026-27");
    expect(seasonOf(Date.parse("2026-05-30"))).toBe("2025-26");
    expect(recentSeasons(Date.parse("2026-09-30"), 3)).toEqual(["2026-27", "2025-26", "2024-25"]);
  });

  it("ships a real Premier League snapshot", () => {
    expect(epl.length).toBeGreaterThan(1900);
    expect(epl.filter((m) => m.season === "2024-25")).toHaveLength(380);
  });
});

describe("Dixon-Coles", () => {
  // Synthetic league with known strengths: the fit should recover their order.
  const teams = ["Strong", "Good", "Average", "Weak"];
  const strength: Record<string, number> = { Strong: 1.6, Good: 1.2, Average: 1, Weak: 0.6 };
  const rng = new Rng("dixon-coles-test");
  const poisson = (l: number) => {
    let k = 0;
    let p = Math.exp(-l);
    let s = p;
    const u = rng.next();
    while (u > s && k < 15) {
      k++;
      p *= l / k;
      s += p;
    }
    return k;
  };
  const start = Date.parse("2025-08-01");
  const matches: HistMatch[] = [];
  for (let r = 0; r < 40; r++)
    for (const h of teams)
      for (const a of teams) {
        if (h === a) continue;
        matches.push({ league: "t", season: "2025-26", date: start + (r * 12 + matches.length % 12) * DAY, home: h, away: a, hg: poisson(1.35 * strength[h] / strength[a] ** 0.5), ag: poisson(1.1 * strength[a] / strength[h] ** 0.5) });
      }
  const asOf = Math.max(...matches.map((m) => m.date)) + DAY;
  const fit = fitPoisson(matches, asOf)!;

  it("recovers team order and a home advantage", () => {
    const a = teams.map((t) => fit.attack.get(t)!);
    expect(a[0]).toBeGreaterThan(a[1]);
    expect(a[1]).toBeGreaterThan(a[3]);
    expect(fit.home).toBeGreaterThan(1);
  });

  it("produces coherent probabilities", () => {
    const g = forecastGoals(fit, "Strong", "Weak");
    expect(g.home + g.draw + g.away).toBeCloseTo(1, 9);
    expect(g.home).toBeGreaterThan(g.away);
    expect(forecastGoals(fit, "Weak", "Strong").away).toBeGreaterThan(g.away);
    expect(g.unknownTeams).toEqual([]);
    expect(forecastGoals(fit, "Promoted", "Strong").unknownTeams).toEqual(["Promoted"]);
  });
});

describe("Elo", () => {
  it("maps rating difference monotonically onto outcomes", () => {
    const elo = newElo();
    const rows = epl.slice(0, 760).map((m) => {
      const diff = (elo.ratings.get(m.home) ?? 1420) + 65 - (elo.ratings.get(m.away) ?? 1420);
      updateElo(elo, m);
      return { diff, outcome: (m.hg > m.ag ? "home" : m.hg === m.ag ? "draw" : "away") as "home" | "draw" | "away" };
    });
    const ol = fitOrderedLogit(rows.slice(380));
    const lo = outcomeProbs(ol, -200);
    const hi = outcomeProbs(ol, 200);
    expect(lo.home + lo.draw + lo.away).toBeCloseTo(1, 9);
    expect(hi.home).toBeGreaterThan(lo.home);
    expect(hi.away).toBeLessThan(lo.away);
  });
});

describe("walk-forward backtest on real results", () => {
  const r = backtest("en.1", epl, Date.parse("2023-07-01"));

  it("beats the base rate and stays calibrated", () => {
    expect(r.rows.length).toBeGreaterThan(1100);
    expect(r.scores.ensemble.logLoss).toBeLessThan(r.scores.baseRate.logLoss - 0.05);
    expect(r.scores.ensemble.rps).toBeLessThan(r.scores.baseRate.rps);
    expect(r.goals.ou25.logLoss).toBeLessThan(r.goals.ou25BaseRate.logLoss);
    const ece = r.calibration.reduce((s, b) => s + b.n * Math.abs(b.meanPredicted - b.observedRate), 0) / r.calibration.reduce((s, b) => s + b.n, 0);
    expect(ece).toBeLessThan(0.03);
  });

  it("only uses matches before each forecast", () => {
    // Changing a later result must not change an earlier forecast.
    const cut = r.rows[500].date;
    const altered = epl.map((m) => (m.date > cut ? { ...m, hg: m.ag, ag: m.hg } : m));
    const r2 = backtest("en.1", altered, Date.parse("2023-07-01"));
    const i = r2.rows.findIndex((x) => x.date > cut) - 1;
    expect(r2.rows[i].ensemble).toEqual(r.rows[i].ensemble);
  });

  it("gives intervals that contain the estimate", () => {
    const asOf = Date.parse("2026-09-25");
    const fit = fitPoisson(epl, asOf)!;
    const elo = newElo();
    for (const m of epl) updateElo(elo, m);
    const f = forecastMatch(fit, elo, { c1: -1.2, c2: 0.1, scale: 2.4, n: 1 }, "Arsenal FC", "Chelsea FC");
    for (const s of f.selections) {
      expect(s.ciLow).toBeLessThanOrEqual(s.probability);
      expect(s.ciHigh).toBeGreaterThanOrEqual(s.probability);
      expect(s.confidence).toBeGreaterThanOrEqual(5);
      expect(s.confidence).toBeLessThanOrEqual(95);
    }
    expect(f.selections.filter((s) => s.market === "1X2").reduce((a, s) => a + s.probability, 0)).toBeCloseTo(1, 9);
  });
});
