import { describe, expect, it } from "vitest";
import { funStats, tipPoints, MODEL_ID, modelTips, nextWeek, previousWeek, standings, weekById, weekMatches, weekOf, weekWinners, type Tip, type TipRow } from "./tips";

describe("weeks in Danish time", () => {
  it("runs Monday to Sunday and names the ISO week", () => {
    // Saturday 3 October 2026, 19:00 in Copenhagen (CEST).
    const w = weekOf(Date.UTC(2026, 9, 3, 17));
    expect(w.id).toBe("2026-W40");
    expect(w.start).toBe(Date.UTC(2026, 8, 27, 22)); // Monday 28 Sep 00:00 CEST
    expect(w.end).toBe(Date.UTC(2026, 9, 4, 22));
    // Sunday 23:30 Copenhagen is still the same week; Monday 00:30 is the next.
    expect(weekOf(Date.UTC(2026, 9, 4, 21, 30)).id).toBe("2026-W40");
    expect(weekOf(Date.UTC(2026, 9, 4, 22, 30)).id).toBe("2026-W41");
  });

  it("handles the switch to winter time and the turn of the year", () => {
    const w = weekById("2026-W44")!;
    // The clocks go back on Sunday 25 October, so Monday 26 October 00:00 is 23:00 UTC.
    expect(w.start).toBe(Date.UTC(2026, 9, 25, 23));
    expect(previousWeek(w).end).toBe(w.start);
    expect(weekOf(Date.UTC(2027, 0, 1, 12)).id).toBe("2026-W53");
    expect(nextWeek(weekById("2026-W53")!).id).toBe("2027-W01");
    expect(previousWeek(weekById("2027-W01")!).id).toBe("2026-W53");
    expect(weekById("2026-W99")).toBeNull();
    expect(weekById("x")).toBeNull();
  });
});

const row = (eventId: string, side: string, odds: number, p: number | null, extra: Partial<TipRow> = {}): TipRow => ({
  eventId,
  leagueId: "football-soccer_denmark_superliga",
  marketType: "1X2",
  side,
  match: "AGF vs FCK",
  league: "Superliga",
  kickoff: Date.UTC(2026, 9, 3, 16),
  status: "scheduled",
  bestOdds: odds,
  modelProbability: p,
  ...extra,
});

describe("the week's matches", () => {
  it("groups the 1X2 rows per match and keeps only this week", () => {
    const week = weekOf(Date.UTC(2026, 9, 3, 12));
    const done = { status: "finished", score: { home: 1, away: 1 } };
    const ms = weekMatches(
      [
        row("a", "home", 2.1, 0.45),
        row("a", "draw", 3.4, 0.27),
        row("a", "away", 3.6, 0.28),
        row("a", "over", 1.9, 0.5, { marketType: "OU" }),
        row("b", "home", 1.5, null, { ...done, kickoff: Date.UTC(2026, 8, 29, 18) }),
        row("b", "draw", 4, null, { ...done, kickoff: Date.UTC(2026, 8, 29, 18) }),
        row("c", "home", 1.5, 0.6, { kickoff: Date.UTC(2026, 9, 6, 18) }),
      ],
      week,
    );
    expect(ms.map((m) => m.eventId)).toEqual(["b", "a"]);
    expect(ms[0]).toMatchObject({ result: "draw", model: null, odds: { home: 1.5, draw: 4, away: null } });
    expect(ms[1]).toMatchObject({ home: "AGF", away: "FCK", result: null, odds: { home: 2.1, draw: 3.4, away: 3.6 } });
    expect(modelTips(ms, week.id)).toMatchObject([{ userId: MODEL_ID, eventId: "a", pick: "home", odds: 2.1 }]);
  });
});

const tip = (userId: string, eventId: string, pick: Tip["pick"], result: Tip["result"], odds = 2, week = "2026-W40", modelPick: Tip["modelPick"] = "home", kickoff = 0): Tip => ({
  userId,
  name: userId,
  eventId,
  week,
  kickoff,
  home: "AGF",
  away: "FCK",
  pick,
  odds,
  modelPick,
  result,
});

describe("standings, winners and fun stats", () => {
  const tips = [
    tip("ida", "a", "home", "home", 1.8, "2026-W39", "home", 1),
    tip("ida", "b", "draw", "draw", 3.5, "2026-W39", "home", 2),
    tip("ida", "c", "away", "home", 3, "2026-W39", "home", 3),
    tip("bo", "a", "home", "home", 1.8, "2026-W39", "home", 1),
    tip("bo", "b", "home", "draw", 2, "2026-W39", "home", 2),
    tip("bo", "c", "home", "home", 1.5, "2026-W39", "home", 3),
    tip("bo", "d", "away", "away", 6, "2026-W40", "home", 4),
    tip("ida", "d", "home", null, 1.4, "2026-W40", "home", 4),
  ];

  it("ranks by points, where a correct tip scores its odds", () => {
    const w39 = standings(tips.filter((t) => t.week === "2026-W39"));
    expect(w39.map((s) => [s.name, s.correct, s.points])).toEqual([
      ["ida", 2, 5.3],
      ["bo", 2, 3.3],
    ]);
    expect(tipPoints(null)).toBe(1);
    expect(tipPoints(1.234)).toBe(1.2);
    expect(tipPoints(25)).toBe(10);
  });

  it("names one winner per week, newest first, and never the model", () => {
    const ws = weekWinners([...tips, tip(MODEL_ID, "d", "away", "away", 6)]);
    expect(ws.map((w) => [w.week, w.winners.map((s) => s.name)])).toEqual([
      ["2026-W40", ["bo"]],
      ["2026-W39", ["ida"]],
    ]);
  });

  it("finds the boldest tip, the draw king, the streak and who beat the model", () => {
    const stats = Object.fromEntries(funStats(tips, weekWinners(tips)).map((s) => [s.id, s]));
    expect(stats.modig).toMatchObject({ name: "bo", detail: "2 til 6,00 i AGF – FCK" });
    expect(stats.uafgjort).toMatchObject({ name: "ida", detail: "1 rigtige X" });
    expect(stats.stime).toMatchObject({ name: "ida" });
    expect(stats.model).toMatchObject({ detail: "1 gang rigtigt, hvor modellen tog fejl" });
    expect(stats.skarp).toBeUndefined(); // nobody has five settled tips yet
    expect(funStats([])).toEqual([]);
  });
});
