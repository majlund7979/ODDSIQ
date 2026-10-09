import { describe, expect, it } from "vitest";
import { leagueTable, monthStart, parseNumber, displayName, type FriendBet } from "./friends";
import type { MarketRow } from "./demo/store";
import { morningHtml, morningSubject, morningText, recipients } from "./morning";
import type { Pick } from "./picks";
import { compareBooks, kelly, oddsMove, riskOf, roundStake, stakeAdvice } from "./picks-advice";

describe("risk level", () => {
  it("is green from 70 %, yellow from 55 % and red below", () => {
    expect(riskOf(0.7).level).toBe("green");
    expect(riskOf(0.69).level).toBe("yellow");
    expect(riskOf(0.55).level).toBe("yellow");
    expect(riskOf(0.54).level).toBe("red");
  });
});

describe("stake suggestion", () => {
  it("stakes a quarter of the Kelly share, capped at 5 %", () => {
    // 60 % at 2.0: Kelly (1.2 − 1) / 1 = 20 %, a quarter is 5 %.
    expect(stakeAdvice(0.6, 2).share).toBeCloseTo(0.05);
    // 55 % at 2.0: Kelly 10 %, a quarter is 2.5 %.
    expect(stakeAdvice(0.55, 2).share).toBeCloseTo(0.025);
    expect(stakeAdvice(0.55, 2).note).toContain("kvart-Kelly");
    // 80 % at 3.0: Kelly 70 %, a quarter is 17.5 %, capped at 5 %.
    expect(stakeAdvice(0.8, 3).share).toBe(0.05);
    expect(kelly(0.5, 3)).toBeCloseTo(0.25);
  });
  it("suggests a small 1 % stake when the odds pay less than fair odds", () => {
    const s = stakeAdvice(0.8, 1.2);
    expect(s.share).toBe(0.01);
    expect(s.note).toContain("ingen værdi");
    expect(s.reason).toContain("Fair odds 1,25, bedste odds 1,20");
  });
  it("falls back to 3, 2 and 1 % by risk level without odds", () => {
    expect(stakeAdvice(0.8, null).share).toBe(0.03);
    expect(stakeAdvice(0.6, null).share).toBe(0.02);
    expect(stakeAdvice(0.4, null).share).toBe(0.01);
  });
  it("rounds to amounts people bet", () => {
    expect(roundStake(30)).toBe(30);
    expect(roundStake(17)).toBe(15);
    expect(roundStake(2)).toBe(5);
    expect(roundStake(147)).toBe(150);
  });
});

describe("odds movement", () => {
  it("shows nothing for small moves", () => {
    expect(oddsMove(0.02, 2, 2.04)).toBeNull();
    expect(oddsMove(NaN, 2, 2)).toBeNull();
  });
  it("states the fact and keeps possible reasons separate", () => {
    const m = oddsMove(-0.1, 2, 1.8)!;
    expect(m.direction).toBe("down");
    expect(m.fact).toContain("faldet 10 %");
    expect(m.maybe).toContain("Vi ved ikke");
  });
});

const bet = (userId: string, result: FriendBet["result"], odds: number | null, stake = 100, name = userId): FriendBet => ({
  id: `${userId}-${Math.random()}`,
  userId,
  name,
  kickoff: 0,
  league: "L",
  match: "A vs B",
  category: "bedste",
  outcome: "A vinder",
  probability: 0.6,
  odds,
  stake,
  result,
});

describe("friends' league", () => {
  it("ranks by profit, counts only settled bets with odds in the profit", () => {
    const t = leagueTable([
      bet("a", "won", 2),
      bet("a", "lost", 2),
      bet("b", "won", 3),
      bet("b", null, 2),
      bet("c", "won", null),
    ]);
    expect(t.map((r) => r.userId)).toEqual(["b", "c", "a"]);
    expect(t[0]).toMatchObject({ bets: 2, settled: 1, won: 1, profit: 200, staked: 100 });
    expect(t[1]).toMatchObject({ settled: 1, won: 1, profit: 0, staked: 0 });
    expect(Number.isNaN(t[1].roi)).toBe(true);
    expect(t[2].profit).toBe(0);
  });
  it("parses Danish numbers and names", () => {
    expect(parseNumber("1,85")).toBe(1.85);
    expect(parseNumber(" 1 000 ")).toBe(1000);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("x")).toBeNull();
    expect(displayName(null, "mads@x.dk")).toBe("mads");
    expect(displayName("  Mads ", "m@x.dk")).toBe("Mads");
  });
  it("starts the month at Copenhagen midnight or just before", () => {
    const s = monthStart(Date.UTC(2026, 9, 15));
    expect(s).toBeLessThanOrEqual(Date.UTC(2026, 8, 30, 22));
    expect(s).toBeGreaterThan(Date.UTC(2026, 8, 30, 12));
  });
});

describe("morning e-mail", () => {
  it("dedupes and validates recipients", () => {
    expect(recipients(["A@x.dk", "b@y.dk"], "a@x.dk, c@z.dk; nope")).toEqual(["a@x.dk", "b@y.dk", "c@z.dk"]);
    expect(recipients([], undefined)).toEqual([]);
  });
  it("escapes team names and says when there are no picks", () => {
    expect(morningHtml([], 0, "https://x", "src")).toContain("Ingen bets i dag");
  });
  it("tells no matches apart from no bets", () => {
    expect(morningHtml([], 0, "https://x", "src", 0)).toContain("ingen kampe de næste 24 timer");
    expect(morningHtml([], 0, "https://x", "src", 4)).toContain("eller vi mangler deres odds fra samme opdatering");
  });
  it("keeps the mail's wording and markup", () => {
    // 07.00 in Copenhagen; the second match is tomorrow.
    const now = Date.UTC(2026, 9, 8, 5);
    const pick = (row: Partial<MarketRow>, outcome: string, probability: number, extra: Partial<Pick> = {}) =>
      ({ row: { movement: 0, openingOdds: row.bestOdds, currentOdds: row.bestOdds, ...row }, outcome, probability, ...extra }) as Pick;
    const picks = [
      pick({ league: "Premier League", match: "Arsenal vs Chelsea", kickoff: Date.UTC(2026, 9, 8, 18, 45), bestOdds: 1.9, bestBook: "bet365", movement: -0.1, openingOdds: 2.1, currentOdds: 1.9 }, "Arsenal vinder", 0.72, { pricedAt: Date.UTC(2026, 9, 8, 4, 15), minOdds: 1.75 }),
      pick({ league: "Serie A & co", match: "Inter vs <Milan>", kickoff: Date.UTC(2026, 9, 9, 11, 30), bestOdds: 1.8, bestBook: "bwin", movement: 0.05, openingOdds: 1.71, currentOdds: 1.8 }, "Uafgjort", 0.5),
      pick({ league: "La Liga", match: "Betis vs Sevilla", kickoff: Date.UTC(2026, 9, 8, 19), bestOdds: 2, bestBook: "bet365" }, "Betis vinder", 0.6),
    ];
    expect(morningSubject(picks, now)).toMatchInlineSnapshot(`"Dagens top 3, torsdag 8. oktober"`);
    expect(morningText([], now, "https://oddsanalyse.dk", "DEMO DATA", 4)).toMatchInlineSnapshot(`
      "Ingen bets i dag: i kampene de næste 24 timer betaler hverken bet365 eller bwin mindst 1 % over Pinnacles (ellers Betfair Exchanges) fair pris ved odds 1,25–5,00, eller vi mangler deres odds fra samme opdatering.

      https://oddsanalyse.dk/picks"
    `);
    expect(morningText(picks, now, "https://oddsanalyse.dk", "DEMO DATA")).toMatchInlineSnapshot(`
      "Forsøg: bets, hvor bet365 eller bwin betaler mindst 1 % mere end Pinnacles odds uden margin. Vi henter odds hver 5.–6. time, så tjek prisen, før du spiller. Den historiske test viste ingen sikker fordel.

      1. Arsenal vinder (72 %, lav risiko)
         Arsenal – Chelsea · Premier League · kl. 20.45
         Odds 1,90 hos bet365 (hentet kl. 06.15) · spil kun til mindst 1,75 · forslag: 5 % af puljen · odds faldet 10 %

      2. Uafgjort (50 %, høj risiko)
         Inter – <Milan> · Serie A & co · i morgen kl. 13.30
         Odds 1,80 hos bwin · forslag: 1 % af puljen (ingen værdi) · odds steget 5 %

      3. Betis vinder (60 %, middel risiko)
         Betis – Sevilla · La Liga · kl. 21.00
         Odds 2,00 hos bet365 · forslag: 5 % af puljen

      Se hele analysen: https://oddsanalyse.dk/picks

      Procenterne er skøn, ikke garantier. Spil kun for penge, du har råd til at tabe. 18+.
      Kilde: DEMO DATA.
      Slå mailen fra under Vennerligaen: https://oddsanalyse.dk/picks/liga"
    `);
    expect(morningHtml(picks, now, "https://oddsanalyse.dk", "DEMO DATA")).toMatchInlineSnapshot(`
      "<!doctype html><html lang="da"><body style="margin:0;background:#f6f6f3;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a19">
      <div style="max-width:560px;margin:0 auto;padding:24px 20px">
      <div style="font-size:13px;font-weight:700;letter-spacing:1px">Oddsanalyse</div>
      <h1 style="font-size:22px;margin:8px 0 4px">Dagens top 3</h1>
      <p style="margin:0 0 12px;color:#3d3c38;font-size:14px">Forsøg: bets, hvor bet365 eller bwin betaler mindst 1 % mere end Pinnacles odds uden margin. Vi henter odds hver 5.–6. time, så tjek prisen, før du spiller. Den historiske test viste ingen sikker fordel.</p>
      <table style="width:100%;border-collapse:collapse"><tr><td style="padding:14px 0;border-top:1px solid #e5e5e0">
      <div style="font-size:12px;color:#77756f">1 · Premier League · kl. 20.45</div>
      <div style="font-size:16px;font-weight:600;margin:4px 0">Arsenal – Chelsea</div>
      <div style="font-size:15px;color:#1f6fd1;font-weight:600">Arsenal vinder</div>
      <div style="font-size:13px;color:#3d3c38;margin-top:6px">
      <b>72 %</b> chance ·
      <span style="color:#0ca30c;font-weight:600">● Lav risiko</span> ·
      odds 1,90 (bet365) (hentet kl. 06.15) · spil kun til mindst 1,75 ·
      forslag 5 % af puljen · odds ↓ faldet 10 %
      </div></td></tr><tr><td style="padding:14px 0;border-top:1px solid #e5e5e0">
      <div style="font-size:12px;color:#77756f">2 · Serie A &amp; co · i morgen kl. 13.30</div>
      <div style="font-size:16px;font-weight:600;margin:4px 0">Inter – &lt;Milan&gt;</div>
      <div style="font-size:15px;color:#1f6fd1;font-weight:600">Uafgjort</div>
      <div style="font-size:13px;color:#3d3c38;margin-top:6px">
      <b>50 %</b> chance ·
      <span style="color:#d03b3b;font-weight:600">● Høj risiko</span> ·
      odds 1,80 (bwin) ·
      forslag 1 % af puljen (ingen værdi) · odds ↑ steget 5 %
      </div></td></tr><tr><td style="padding:14px 0;border-top:1px solid #e5e5e0">
      <div style="font-size:12px;color:#77756f">3 · La Liga · kl. 21.00</div>
      <div style="font-size:16px;font-weight:600;margin:4px 0">Betis – Sevilla</div>
      <div style="font-size:15px;color:#1f6fd1;font-weight:600">Betis vinder</div>
      <div style="font-size:13px;color:#3d3c38;margin-top:6px">
      <b>60 %</b> chance ·
      <span style="color:#c98a00;font-weight:600">● Middel risiko</span> ·
      odds 2,00 (bet365) ·
      forslag 5 % af puljen
      </div></td></tr></table>
      <p style="margin:20px 0"><a href="https://oddsanalyse.dk/picks" style="background:#1f6fd1;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">Se hele analysen</a></p>
      <p style="font-size:12px;color:#77756f;line-height:1.5">Procenterne er skøn, ikke garantier. Spil kun for penge, du har råd til at tabe. 18+. Kilde: DEMO DATA.<br>
      <a href="https://oddsanalyse.dk/picks/liga" style="color:#77756f">Slå morgenmailen fra</a></p>
      </div></body></html>"
    `);
    expect(morningHtml([], now, "https://oddsanalyse.dk", "DEMO DATA", 0)).toMatchInlineSnapshot(`
      "<!doctype html><html lang="da"><body style="margin:0;background:#f6f6f3;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a19">
      <div style="max-width:560px;margin:0 auto;padding:24px 20px">
      <div style="font-size:13px;font-weight:700;letter-spacing:1px">Oddsanalyse</div>
      <h1 style="font-size:22px;margin:8px 0 4px">Dagens top </h1>
      <p style="margin:0 0 12px;color:#3d3c38;font-size:14px">Forsøg: bets, hvor bet365 eller bwin betaler mindst 1 % mere end Pinnacles odds uden margin. Vi henter odds hver 5.–6. time, så tjek prisen, før du spiller. Den historiske test viste ingen sikker fordel.</p>
      <p>Ingen bets i dag: der er ingen kampe de næste 24 timer.</p>
      <p style="margin:20px 0"><a href="https://oddsanalyse.dk/picks" style="background:#1f6fd1;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">Se hele analysen</a></p>
      <p style="font-size:12px;color:#77756f;line-height:1.5">Procenterne er skøn, ikke garantier. Spil kun for penge, du har råd til at tabe. 18+. Kilde: DEMO DATA.<br>
      <a href="https://oddsanalyse.dk/picks/liga" style="color:#77756f">Slå morgenmailen fra</a></p>
      </div></body></html>"
    `);
  });
});

describe("bookmaker comparison", () => {
  it("lists a bookmaker quoted by both feeds once, at its latest price", () => {
    const c = compareBooks([{ book: "Pinnacle", odds: 2.0, at: 1 }, { book: "Pinnacle", odds: 2.1, at: 2 }, { book: "Unibet", odds: 1.9, at: 2 }], 1.95)!;
    expect(c.rows.map((r) => [r.book, r.odds])).toEqual([["Pinnacle", 2.1], ["Unibet", 1.9]]);
  });
  it("marks the best price and the ones above fair odds", () => {
    const c = compareBooks([{ book: "A", odds: 1.9 }, { book: "B", odds: 2.1 }, { book: "C", odds: 2.0 }], 1.95)!;
    expect(c.rows.map((r) => r.book)).toEqual(["B", "C", "A"]);
    expect(c.rows.map((r) => r.best)).toEqual([true, false, false]);
    expect(c.rows.map((r) => r.value)).toEqual([true, true, false]);
    expect(c.median).toBe(2);
    expect(c.bestOverMedian).toBeCloseTo(0.05);
    expect(compareBooks([{ book: "A", odds: 2 }], 1.9)).toBeNull();
    expect(compareBooks(undefined, 1.9)).toBeNull();
  });
});
