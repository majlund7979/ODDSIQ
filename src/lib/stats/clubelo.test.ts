import { describe, expect, it } from "vitest";
import { analysePick } from "@/lib/picks";
import type { MarketRow } from "@/lib/demo/store";
import { clubEloProbs, clubPair, findClub, parseClubElo } from "./clubelo";

const CSV = `Rank,Club,Country,Level,Elo,From,To
1,Man City,ENG,1,2040.5,2026-10-01,2026-10-07
2,Bayern,GER,1,1990.1,2026-10-01,2026-10-07
3,Paris SG,FRA,1,1950,2026-10-01,2026-10-07
None,FC Kobenhavn,DEN,1,1620.3,2026-10-01,2026-10-07
None,Midtjylland,DEN,1,1600,2026-10-01,2026-10-07
None,Brondby,DEN,1,1540,2026-10-01,2026-10-07
None,Forest,ENG,1,1780,2026-10-01,2026-10-07
bad line
`;

describe("ClubElo", () => {
  const ratings = parseClubElo(CSV);

  it("parses the daily CSV and skips bad lines", () => {
    expect(ratings).toHaveLength(7);
    expect(ratings[0]).toEqual({ club: "Man City", country: "ENG", level: 1, elo: 2040.5 });
  });

  it("matches feed names to ClubElo's short names, within the league's country", () => {
    expect(findClub("FC København", "tod-soccer_denmark_superliga", ratings)?.club).toBe("FC Kobenhavn");
    expect(findClub("FC Copenhagen", "apf-soccer_denmark_superliga", ratings)?.club).toBe("FC Kobenhavn");
    expect(findClub("Brøndby IF", "apf-soccer_denmark_superliga", ratings)?.club).toBe("Brondby");
    expect(findClub("Nottingham Forest", "tod-soccer_epl", ratings)?.club).toBe("Forest");
    expect(findClub("Manchester City", "tod-soccer_epl", ratings)?.club).toBe("Man City");
    // Champions League looks across countries; a domestic league does not.
    expect(clubPair("Bayern Munich", "FC Copenhagen", "tod-soccer_uefa_champs_league", ratings, 0)?.home.club).toBe("Bayern");
    expect(findClub("Bayern Munich", "tod-soccer_epl", ratings)).toBeNull();
    // National teams are not clubs.
    expect(findClub("Denmark", "apf-soccer_international_friendlies", ratings)).toBeNull();
  });

  it("turns the rating gap into 1X2 probabilities that add up to one", () => {
    const even = clubEloProbs(1600, 1600, 0);
    expect(even.home).toBeCloseTo(even.away, 6);
    expect(even.draw).toBeGreaterThan(0.25);
    const fav = clubEloProbs(2000, 1600);
    expect(fav.home).toBeGreaterThan(0.75);
    expect(fav.home + fav.draw + fav.away).toBeCloseTo(1, 9);
  });

  it("moves a market-only 1X2 pick part of the way towards the ClubElo estimate", () => {
    const row = { marketType: "1X2", side: "home", modelProbability: null, marketProbability: 0.6, movement: 0, quotes: [] } as unknown as MarketRow;
    const pair = clubPair("Bayern Munich", "FC Copenhagen", "tod-soccer_uefa_champs_league", ratings, 0)!;
    const a = analysePick(row, { news: null, clubElo: pair })!;
    const e = clubEloProbs(pair.home.elo, pair.away.elo).home;
    expect(a.marketOnly).toBe(true);
    expect(a.probability).toBeCloseTo(0.7 * 0.6 + 0.3 * e, 6);
    expect(a.factors.map((f) => f.label)).toContain("Holdstyrke (ClubElo)");
    // Other markets stay at the market's price.
    const ou = analysePick({ ...row, marketType: "OU25", side: "over" } as MarketRow, { news: null, clubElo: pair })!;
    expect(ou.probability).toBe(0.6);
  });
});
