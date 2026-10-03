import { describe, expect, it } from "vitest";
import { INTL_CODE, parseInternationalCsv } from "./international";
import { leagueForOddsKey } from "./openfootball";
import { matchTeam } from "./teams";

const CSV = `date,home_team,away_team,home_score,away_score,tournament,city,country,neutral
2019-06-07,Denmark,Ireland,1,1,UEFA Euro qualification,Copenhagen,Denmark,FALSE
2025-09-05,Scotland,Denmark,0,0,FIFA World Cup qualification,Glasgow,Scotland,FALSE
2026-10-09,Denmark,Scotland,NA,NA,UEFA Nations League,Copenhagen,Denmark,FALSE
`;

describe("international results", () => {
  it("keeps played matches since the cut-off and skips unplayed fixtures", () => {
    const rows = parseInternationalCsv(CSV, Date.parse("2022-01-01T00:00:00Z"));
    expect(rows).toEqual([{ league: INTL_CODE, season: "2025", date: Date.parse("2025-09-05T12:00:00Z"), home: "Scotland", away: "Denmark", hg: 0, ag: 0 }]);
  });

  it("covers every national-team competition with the one results history", () => {
    for (const k of ["soccer_uefa_nations_league", "soccer_fifa_world_cup_qualifiers_europe", "soccer_uefa_euro_qualification", "soccer_international_friendlies"]) expect(leagueForOddsKey(k)?.code).toBe(INTL_CODE);
  });

  it("matches API-Football's national-team names to the results data", () => {
    expect(matchTeam("Türkiye", ["Turkey", "Spain"])).toBe("Turkey");
    expect(matchTeam("Czechia", ["Czech Republic"])).toBe("Czech Republic");
    expect(matchTeam("Ireland", ["Republic of Ireland", "Northern Ireland"])).toBe("Republic of Ireland");
    expect(matchTeam("Northern Ireland", ["Republic of Ireland", "Northern Ireland"])).toBe("Northern Ireland");
  });
});
