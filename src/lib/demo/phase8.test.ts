import { describe, expect, it } from "vitest";
import { parseQuestion, teamsIn } from "./analyst";
import { TEAMS } from "./catalog";
import { marketCommentary, whatChangedSummary } from "./commentary";
import { assistantAnswer, decodePositions, decodeWatchlist, encodePositions, encodeWatchlist, findByName, matchAssistantQuestion, positionView, toggleWatchItem, watchedRows, type WatchItem } from "./personal";
import { reportWeeks, weeklyReport } from "./report";
import { ledgerRows, marketDetail, marketRows } from "./store";

const NOW = Date.parse("2026-09-29T20:30:00Z");
const FORBIDDEN = /\b(because|due to|caused|driven by|best bet|lock|guaranteed|sure thing|broken)\b/i;

describe("watchlist storage", () => {
  it("round-trips and drops malformed or duplicate entries", () => {
    const items: WatchItem[] = [
      { kind: "team", id: "epl-arsenal" },
      { kind: "league", id: "epl" },
      { kind: "model", id: "football-ensemble-v1.4" },
    ];
    expect(decodeWatchlist(encodeWatchlist(items))).toEqual(items);
    expect(decodeWatchlist("t:epl-arsenal,t:epl-arsenal,x:foo,t:<script>,l:")).toEqual([{ kind: "team", id: "epl-arsenal" }]);
    expect(toggleWatchItem(toggleWatchItem([], items[0]), items[0])).toEqual([]);
  });
  it("finds teams and leagues by name", () => {
    expect(findByName("arsenal")).toEqual({ kind: "team", id: "epl-arsenal" });
    expect(findByName("Premier League")).toEqual({ kind: "league", id: "epl" });
    expect(findByName("nobody fc")).toBeNull();
  });
  it("matches rows by team, league, event and market", () => {
    const league = marketRows(NOW).find((r) => r.status === "scheduled")!;
    const rows = watchedRows([{ kind: "league", id: league.leagueId }], NOW);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.leagueId === league.leagueId)).toBe(true);
    expect(watchedRows([{ kind: "market", id: league.selectionId }], NOW).map((r) => r.selectionId)).toEqual([league.selectionId]);
    expect(watchedRows([], NOW)).toEqual([]);
  });
});

describe("My Market Assistant", () => {
  const items: WatchItem[] = [{ kind: "league", id: "epl" }, { kind: "league", id: "laliga" }];
  it("applies the saved threshold", () => {
    const loose = assistantAnswer("interesting", items, 1, NOW);
    const strict = assistantAnswer("interesting", items, 30, NOW);
    expect(loose.rows.length).toBeGreaterThan(0);
    for (const r of loose.rows) expect(Math.abs(r.edgePp!)).toBeGreaterThanOrEqual(1);
    expect(strict.rows.length).toBeLessThanOrEqual(loose.rows.length);
  });
  it("answers every question without claiming causes", () => {
    for (const q of ["interesting", "moved", "live", "soon", "record"] as const) {
      const a = assistantAnswer(q, [...items, { kind: "team", id: "epl-arsenal" }], 5, NOW);
      expect(a.sentences.length).toBeGreaterThan(0);
      for (const s of a.sentences) expect(s).not.toMatch(FORBIDDEN);
    }
    expect(assistantAnswer("interesting", [], 5, NOW).sentences[0]).toMatch(/empty/);
  });
  it("maps free text to questions", () => {
    expect(matchAssistantQuestion("anything interesting in my watchlist?")).toBe("interesting");
    expect(matchAssistantQuestion("what's live")).toBe("live");
    expect(matchAssistantQuestion("tell me a joke")).toBeNull();
  });
});

describe("analyst", () => {
  it("parses teams, comparisons and topics", () => {
    expect(parseQuestion("analyze Arsenal")).toEqual({ kind: "team", teamId: "epl-arsenal" });
    expect(parseQuestion("compare Liverpool Chelsea")).toEqual({ kind: "compare", a: "epl-liverpool", b: "epl-chelsea" });
    expect(parseQuestion("weekly report")?.kind).toBe("report");
    expect(parseQuestion("which prices moved most?")?.kind).toBe("movers");
    expect(parseQuestion("what's the weather")?.kind).toBe("unknown");
    expect(teamsIn("Manchester United vs Manchester City")).toEqual(["epl-manchester-united", "epl-manchester-city"]);
    expect(TEAMS.length).toBeGreaterThan(100);
  });
  it("writes commentary only from supplied figures", () => {
    const pre = marketRows(NOW).filter((r) => r.status === "scheduled" && r.modelProbability !== null).slice(0, 25);
    for (const r of pre) {
      const d = marketDetail(r.selectionId, NOW)!;
      const text = [...marketCommentary(d, NOW), whatChangedSummary(d)];
      for (const t of text) expect(t).not.toMatch(FORBIDDEN);
      expect(text.join(" ")).toContain((d.analysis.ensemble.probability * 100).toFixed(1));
    }
  });
});

describe("weekly report", () => {
  const rows = ledgerRows(NOW);
  const weeks = reportWeeks(rows);
  it("covers recent weeks with settled predictions", () => {
    expect(weeks.length).toBeGreaterThan(4);
    for (let i = 1; i < weeks.length; i++) expect(weeks[i]).toBeLessThan(weeks[i - 1]);
  });
  it("reports with sample sizes and cautious wording", () => {
    const r = weeklyReport(rows, weeks[1], marketRows(NOW));
    expect(r.week.n).toBeGreaterThan(0);
    expect(r.baseline.n).toBeGreaterThan(r.week.n);
    expect(r.findings.length).toBeGreaterThan(0);
    for (const f of r.findings) {
      expect(f.text).not.toMatch(FORBIDDEN);
      if (f.severity === "issue") expect(f.text).toMatch(/potential issue detected/i);
    }
    expect(r.misses.length).toBeLessThanOrEqual(3);
  });
});

describe("tracked positions", () => {
  it("round-trips and computes CLV against the closing price once started", () => {
    const row = marketRows(NOW).find((r) => r.status === "scheduled")!;
    const ps = [{ selectionId: row.selectionId, odds: 2.1, at: NOW - 60_000 }];
    expect(decodePositions(encodePositions(ps))).toEqual([{ ...ps[0], at: Math.round(ps[0].at / 1000) * 1000 }]);
    expect(decodePositions("bad|x|1,<a>|2|3")).toEqual([]);
    const v = positionView(ps[0], NOW)!;
    expect(v.provisional).toBe(true);
    expect(v.clv).toBeCloseTo(2.1 * v.referenceFair - 1, 10);
    const later = positionView(ps[0], row.kickoff + 4 * 3_600_000)!;
    expect(later.provisional).toBe(false);
  });
});
