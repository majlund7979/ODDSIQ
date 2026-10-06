"""Reads the site's own tables (Prisma, schema public) — read-only.

The site already fetches fixtures, results and odds (The Odds API, API-Football). The engine does
not fetch them a second time: it reads what the site stored. Only the 16 divisions the engine has
history for are used (KEY_TO_DIVISION); other competitions have no football-data history, so the
model cannot rate their teams.
"""
from __future__ import annotations

import pandas as pd

from engine.sources.af_export import AF_TO_DIVISION

# The site's competition keys (The Odds API sport keys, also used for API-Football) → football-data division.
KEY_TO_DIVISION = {
    "soccer_epl": "E0", "soccer_efl_champ": "E1", "soccer_germany_bundesliga": "D1", "soccer_germany_bundesliga2": "D2",
    "soccer_spain_la_liga": "SP1", "soccer_spain_segunda_division": "SP2", "soccer_italy_serie_a": "I1",
    "soccer_italy_serie_b": "I2", "soccer_france_ligue_one": "F1", "soccer_france_ligue_two": "F2",
    "soccer_netherlands_eredivisie": "N1", "soccer_portugal_primeira_liga": "P1", "soccer_belgium_first_div": "B1",
    "soccer_spl": "SC0", "soccer_turkey_super_league": "T1", "soccer_greece_super_league": "G1",
}
# The site's market types and selection id suffixes → engine vocabulary.
MARKETS = {"1X2": ("1x2", None), "OU25": ("ou", 2.5)}


def division_of(league_id: str) -> str | None:
    """'apf-soccer_epl' → 'E0'. The prefix names the feed; the key after it names the competition."""
    i = str(league_id).find("soccer_")
    return KEY_TO_DIVISION.get(str(league_id)[i:]) if i >= 0 else None


def _frame(conn, sql, params=()) -> pd.DataFrame:
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return pd.DataFrame(cur.fetchall(), columns=[d.name for d in cur.description])


def events(conn, since, until) -> pd.DataFrame:
    """Every feed event (externalId set, so no demo data) with kickoff in [since, until)."""
    e = _frame(conn, """
        SELECT e.id AS event_id, e."externalId" AS external_id, e."leagueId" AS league_id, e.kickoff, e.status,
               e."homeScore" AS home_goals, e."awayScore" AS away_goals, ht.name AS home, at.name AS away
        FROM "Event" e JOIN "Team" ht ON ht.id = e."homeTeamId" JOIN "Team" at ON at.id = e."awayTeamId"
        WHERE e."externalId" IS NOT NULL AND e.kickoff >= %s AND e.kickoff < %s""", (since, until))
    e["division"] = e["league_id"].map(division_of)
    e = e.dropna(subset=["division"])
    e["kickoff"] = pd.to_datetime(e["kickoff"], utc=True)
    e["af_fixture_id"] = [int(x.split(":", 1)[1]) if str(x).startswith("apf:") and x.split(":", 1)[1].isdigit() else None
                          for x in e["external_id"]]
    return e.reset_index(drop=True)


def stats_results(conn, since) -> pd.DataFrame:
    """Finished API-Football fixtures from the site's statistics feed (results the history lacks)."""
    r = _frame(conn, """
        SELECT "leagueId" AS af_league_id, kickoff, home, away, "homeGoals" AS home_goals, "awayGoals" AS away_goals,
               stats
        FROM "StatsFixture"
        WHERE provider = 'api-football' AND status = 'finished' AND "homeGoals" IS NOT NULL AND kickoff >= %s""", (since,))
    r["division"] = r["af_league_id"].map(AF_TO_DIVISION)
    r = r.dropna(subset=["division"])
    r["kickoff"] = pd.to_datetime(r["kickoff"], utc=True)
    return r.reset_index(drop=True)


def odds(conn, event_ids) -> pd.DataFrame:
    """Pre-match prices (OddsSnapshot holds no in-play prices) for 1X2 and O/U 2.5."""
    if not len(event_ids):
        return pd.DataFrame(columns=["event_id", "bookmaker", "market", "line", "selection", "odds", "available_at"])
    o = _frame(conn, """
        SELECT s."eventId" AS event_id, m.type AS site_market, s.id AS selection_id, o."bookmakerId" AS bookmaker,
               o.odds::float8 AS odds, o."observedAt" AS available_at
        FROM "OddsSnapshot" o JOIN "Selection" s ON s.id = o."selectionId" JOIN "Market" m ON m.id = s."marketId"
        WHERE s."eventId" = ANY(%s) AND m.type = ANY(%s)""", (list(event_ids), list(MARKETS)))
    o["market"] = o["site_market"].map(lambda t: MARKETS[t][0])
    o["line"] = o["site_market"].map(lambda t: MARKETS[t][1])
    o["selection"] = o["selection_id"].str.rsplit("-", n=1).str[1]
    o["available_at"] = pd.to_datetime(o["available_at"], utc=True)
    o["kind"] = "snapshot"
    ok = o["selection"].isin(["home", "draw", "away", "over", "under"]) & (o["odds"] > 1)
    return o.loc[ok, ["event_id", "bookmaker", "market", "line", "selection", "odds", "available_at", "kind"]].reset_index(drop=True)
