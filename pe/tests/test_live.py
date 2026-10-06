"""Daily shadow run: team names, reading the site's tables, and writing a run to schema pe.

The database tests run when PE_TEST_DSN is set. They create minimal copies of the site's Prisma
tables (only the columns the engine reads) next to a fresh schema pe."""
import os
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from conftest import make_league
from engine.live import names, predict, site

SQL = Path(__file__).resolve().parents[1] / "sql"
NOW = pd.Timestamp("2026-10-06 05:30", tz="UTC")


# ---------------------------------------------------------------- names

def test_aliases_and_fuzzy_matching():
    al = names.load_aliases()
    ren = names.history_renames(al)
    assert ren["Nottm Forest"] == "Nott'm Forest"          # football-data renamed the club; history uses the newest
    m = names.site_to_history(["Nottingham Forest", "Manchester City", "Brighton & Hove Albion", "Arsenal FC", "Real Madrid"],
                              ["Nott'm Forest", "Man City", "Brighton", "Arsenal", "Chelsea"], al)
    got = m.set_index("site")["team"].to_dict()
    assert got["Nottingham Forest"] == "Nott'm Forest"
    assert got["Manchester City"] == "Man City"
    assert got["Arsenal FC"] == "Arsenal"
    assert got["Brighton & Hove Albion"] == "Brighton"
    assert pd.isna(got["Real Madrid"])                        # never guessed into a wrong team
    assert names.similarity("Celta B", "Celta") == 0.0 and names.similarity("Jong Ajax", "Ajax") == 0.0


def test_site_league_keys_map_to_divisions():
    assert site.division_of("apf-soccer_epl") == "E0"
    assert site.division_of("odds-soccer_germany_bundesliga2") == "D2"
    assert site.division_of("apf-soccer_uefa_champs_league") is None


# ---------------------------------------------------------------- the run without a database

def _history():
    lg = make_league(seed=3, teams=8, seasons=(2022, 2023, 2024, 2025))
    m = lg["matches"].assign(league="E0", group="ENG", match_id=lambda d: "h" + d["match_id"].astype(str))
    ts = lg["team_stats"].assign(match_id=lambda d: "h" + d["match_id"].astype(str))
    # bet365 1X2 and O/U prices for the blend fit: fair probabilities from goals, plus 5 % margin.
    rng = np.random.default_rng(0)
    rows = []
    for r in m.itertuples(index=False):
        p = rng.dirichlet([4, 2.5, 3]); q = rng.uniform(0.4, 0.6)
        for sel, pp in zip(("home", "draw", "away"), p):
            rows.append((r.match_id, "bet365", "1x2", None, sel, round(1 / (pp * 1.05), 2), "pre", r.kickoff - pd.Timedelta(hours=30)))
        for sel, pp in (("over", q), ("under", 1 - q)):
            rows.append((r.match_id, "bet365", "ou", 2.5, sel, round(1 / (pp * 1.05), 2), "pre", r.kickoff - pd.Timedelta(hours=30)))
    odds = pd.DataFrame(rows, columns=["match_id", "bookmaker", "market", "line", "selection", "odds", "kind", "available_at"])
    return {"matches": m, "team_stats": ts, "odds": odds}


def _site(n=4):
    teams = [f"T{i}" for i in range(8)]
    ev = pd.DataFrame({"event_id": [f"apf-{900 + i}" for i in range(n)], "external_id": [f"apf:{900 + i}" for i in range(n)],
                       "league_id": "apf-soccer_epl", "division": "E0",
                       "kickoff": [NOW + pd.Timedelta(hours=26 + 24 * i) for i in range(n)], "status": "scheduled",
                       "home_goals": np.nan, "away_goals": np.nan,
                       "home": [f"{teams[2 * i]} FC" for i in range(n)], "away": [teams[2 * i + 1] for i in range(n)],
                       "af_fixture_id": [900 + i for i in range(n)]})
    rows = []
    for e in ev.itertuples(index=False):
        for b, k in (("bet365", 1.0), ("unibet", 1.02), ("pinnacle", 1.04)):
            for sel, o in (("home", 2.1), ("draw", 3.4), ("away", 3.6), ("over", 1.9), ("under", 1.95)):
                rows.append((e.event_id, b, "ou" if sel in ("over", "under") else "1x2", 2.5 if sel in ("over", "under") else None,
                             sel, round(o * k, 2), NOW - pd.Timedelta(hours=3), "snapshot"))
    odds = pd.DataFrame(rows, columns=["event_id", "bookmaker", "market", "line", "selection", "odds", "available_at", "kind"])
    return ev, odds


@pytest.fixture(scope="module")
def run():
    ev, odds = _site()
    empty = pd.DataFrame(columns=["division", "kickoff", "home", "away", "home_goals", "away_goals"])
    frames, upcoming, rep = predict.assemble(_history(), ev, empty, NOW)
    assert rep["upcoming_mapped"] == 4 and rep["unmapped_names"] == []
    return predict.predict(frames, upcoming, odds, NOW, families=("elo", "logreg"), log=lambda *_: None)


def test_run_probabilities_and_value_table(run):
    p = run.preds
    assert len(p) == 4 * 5
    sums = p.groupby(["match_id", "market"])["p"].sum()
    assert np.allclose(sums, 1.0)
    assert p["p_market"].notna().all()
    # The fitted shrinkage (tau = 0) leaves no edge, and no league/market has a documented edge: nothing is approved.
    assert len(run.value) == 20 and not run.value["is_bet"].any()
    assert run.value["rejected_because"].str.contains("ingen dokumenteret edge").all()
    assert (run.features["cutoff"] == NOW).all() and (run.matches["kickoff"] > NOW).all()


# ---------------------------------------------------------------- database

DSN = os.environ.get("PE_TEST_DSN")
db = pytest.mark.skipif(not DSN, reason="set PE_TEST_DSN to a scratch Postgres database")

SITE_TABLES = """
DROP TABLE IF EXISTS "OddsSnapshot", "Selection", "Market", "Event", "Team", "StatsFixture" CASCADE;
CREATE TABLE "Team" (id text PRIMARY KEY, name text NOT NULL);
CREATE TABLE "Event" (id text PRIMARY KEY, "externalId" text, "leagueId" text, "homeTeamId" text, "awayTeamId" text,
                      kickoff timestamp(3) NOT NULL, status text NOT NULL, "homeScore" int, "awayScore" int);
CREATE TABLE "Market" (id text PRIMARY KEY, "eventId" text, type text, name text);
CREATE TABLE "Selection" (id text PRIMARY KEY, "marketId" text, "eventId" text, name text);
CREATE TABLE "OddsSnapshot" (id bigserial PRIMARY KEY, "selectionId" text, "bookmakerId" text, "observedAt" timestamp(3),
                             odds numeric(8,3), "sourceId" text);
CREATE TABLE "StatsFixture" (id text PRIMARY KEY, provider text, "leagueId" int, kickoff timestamp(3), home text, away text,
                             status text, "homeGoals" int, "awayGoals" int, stats jsonb);
"""


@pytest.fixture()
def conn():
    psycopg = pytest.importorskip("psycopg")
    c = psycopg.connect(DSN, autocommit=True)
    c.execute("DROP SCHEMA IF EXISTS pe CASCADE")
    for f in ("001_schema.sql", "002_api.sql", "003_live.sql"):
        c.execute((SQL / f).read_text())
    c.execute(SITE_TABLES)
    ev, odds = _site()
    with c.cursor() as cur:
        for e in ev.itertuples(index=False):
            for side in (e.home, e.away):
                cur.execute('INSERT INTO "Team" VALUES (%s,%s) ON CONFLICT DO NOTHING', (f"t-{side}", side))
            cur.execute('INSERT INTO "Event" VALUES (%s,%s,%s,%s,%s,%s,%s,NULL,NULL)',
                        (e.event_id, e.external_id, e.league_id, f"t-{e.home}", f"t-{e.away}", e.kickoff.tz_convert(None), "scheduled"))
            for mt in ("1X2", "OU25"):
                cur.execute('INSERT INTO "Market" VALUES (%s,%s,%s,%s)', (f"{e.event_id}-{mt.lower()}", e.event_id, mt, mt))
        for o in odds.itertuples(index=False):
            mt = "ou25" if o.market == "ou" else "1x2"
            sid = f"{o.event_id}-{mt}-{o.selection}"
            cur.execute('INSERT INTO "Selection" VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING', (sid, f"{o.event_id}-{mt}", o.event_id, o.selection))
            cur.execute('INSERT INTO "OddsSnapshot" ("selectionId", "bookmakerId", "observedAt", odds, "sourceId") VALUES (%s,%s,%s,%s,%s)',
                        (sid, o.bookmaker, o.available_at.tz_convert(None), o.odds, "test"))
        # A demo event (no externalId) and an unsupported league are ignored.
        cur.execute('INSERT INTO "Event" VALUES (%s,NULL,%s,%s,%s,%s,%s,NULL,NULL)',
                    ("demo-1", "demo-soccer_epl", "t-T0 FC", "t-T1", (NOW + pd.Timedelta(days=1)).tz_convert(None), "scheduled"))
        cur.execute('INSERT INTO "Event" VALUES (%s,%s,%s,%s,%s,%s,%s,NULL,NULL)',
                    ("apf-1", "apf:1", "apf-soccer_uefa_champs_league", "t-T0 FC", "t-T1", (NOW + pd.Timedelta(days=1)).tz_convert(None), "scheduled"))
    yield c
    c.close()


@db
def test_site_reader(conn):
    ev = site.events(conn, NOW - pd.Timedelta(days=1), NOW + pd.Timedelta(days=8))
    assert sorted(ev["event_id"]) == [f"apf-{900 + i}" for i in range(4)]
    assert set(ev["division"]) == {"E0"} and ev["af_fixture_id"].tolist() == [900, 901, 902, 903]
    o = site.odds(conn, ev["event_id"])
    assert len(o) == 4 * 3 * 5
    assert set(o["selection"]) == {"home", "draw", "away", "over", "under"}
    assert set(o.loc[o["market"] == "ou", "line"]) == {2.5}


@db
def test_write_shadow_run_twice(conn, run):
    from engine.live import write
    c1 = write.write(conn, run, "abc1234")
    assert c1["matches"] == 4 and c1["predictions"] == 20 and c1["value_rows"] == 20 and c1["approved_bets"] == 0
    assert c1["odds_rows"] == 4 * 3 * 5
    write.log_run(conn, NOW, "ok", c1, "abc1234", c1["model_version"])
    later = predict.Run(**{**run.__dict__, "now": NOW + pd.Timedelta(hours=9)})
    c2 = write.write(conn, later, "abc1234")
    assert c2["odds_rows"] == 0                              # same prices are not stored twice
    q = lambda sql: conn.execute(sql).fetchall()  # noqa: E731
    assert q("SELECT count(*) FROM pe.match")[0][0] == 4
    assert q("SELECT count(*) FROM pe.prediction")[0][0] == 40     # append-only: the second run adds rows
    assert q("SELECT DISTINCT status FROM pe.model") == [("shadow",)]
    # Shadow mode: nothing reaches the views the site reads.
    assert q("SELECT count(*) FROM pe.latest_prediction")[0][0] == 0
    assert q("SELECT count(*) FROM pe.latest_value_bet")[0][0] == 0
    assert q("SELECT count(*) FROM pe.prediction p JOIN pe.match m ON m.id = p.match_id WHERE p.data_as_of >= m.kickoff")[0][0] == 0
    assert q("SELECT count(*) FROM pe.team_alias WHERE source = 'site' AND alias = 'T0 FC'")[0][0] == 1
    assert q("SELECT status FROM pe.job_run") == [("ok",)]
    # Promoting the model would show the newest run.
    conn.execute("UPDATE pe.model SET status = 'live'")
    assert q("SELECT count(*) FROM pe.latest_prediction")[0][0] == 20
    assert q("SELECT count(*) FROM pe.latest_value_bet")[0][0] == 20
