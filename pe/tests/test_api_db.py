"""Runs against a real Postgres when PE_TEST_DSN is set (schema loaded fresh each run)."""
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
import pytest

psycopg = pytest.importorskip("psycopg")
DSN = os.environ.get("PE_TEST_DSN")
pytestmark = pytest.mark.skipif(not DSN, reason="set PE_TEST_DSN to a scratch Postgres database")
SQL = Path(__file__).resolve().parents[1] / "sql"
KO = datetime(2026, 10, 10, 18, 0, tzinfo=timezone.utc)

from engine import store  # noqa: E402


@pytest.fixture()
def conn():
    c = psycopg.connect(DSN, autocommit=True)
    c.execute("DROP SCHEMA IF EXISTS pe CASCADE")
    c.execute((SQL / "001_schema.sql").read_text())
    c.execute((SQL / "002_api.sql").read_text())
    c.execute("""
      INSERT INTO pe.competition (id, name, kind) VALUES (1, 'Premier League', 'league');
      INSERT INTO pe.season (id, competition_id, year) VALUES (1, 1, 2026);
      INSERT INTO pe.team (id, name) VALUES (1, 'Arsenal'), (2, 'Chelsea');
      INSERT INTO pe.match (id, season_id, kickoff, home_team_id, away_team_id, status) VALUES (1, 1, '{ko}', 1, 2, 'scheduled');
      INSERT INTO pe.bookmaker (id, key, sharp) VALUES (1, 'pinnacle', true), (2, 'bet365', false);
      INSERT INTO pe.feature_set (version, features, code_sha) VALUES ('fs-1', '[]', 'abc');
      INSERT INTO pe.model (version, family, params, code_sha, status) VALUES
        ('ens-1', 'ensemble', '{{}}', 'abc', 'live'), ('ens-2', 'ensemble', '{{}}', 'abc', 'shadow');
    """.format(ko=KO.isoformat()))
    for book, at, odds in ((1, KO - timedelta(days=2), (2.20, 3.40, 3.30)), (1, KO - timedelta(hours=3), (2.00, 3.50, 3.90)),
                           (2, KO - timedelta(hours=3), (2.05, 3.40, 3.70)), (1, KO, (1.95, 3.6, 4.1))):
        for sel, o in zip(("home", "draw", "away"), odds):
            c.execute("INSERT INTO pe.odds_snapshot (match_id, bookmaker_id, market, selection, odds, observed_at, kind, source) "
                      "VALUES (1, %s, '1x2', %s, %s, %s, %s, 'test')", (book, sel, o, at, "closing" if at == KO else "snapshot"))
    yield c
    c.close()


def preds(model, ps, created_offset=0):
    return pd.DataFrame([{"match_id": 1, "model_version": model, "feature_set": "fs-1", "stage": "pre_lineup",
                          "market": "1x2", "line": None, "selection": s, "probability": p, "data_as_of": KO - timedelta(hours=2)}
                         for s, p in zip(("home", "draw", "away"), ps)])


def test_latest_live_prediction_feeds_the_match_card(conn):
    store.write_predictions(conn, preds("ens-1", (0.50, 0.27, 0.23)))
    store.write_predictions(conn, preds("ens-1", (0.52, 0.26, 0.22)))     # newer run
    store.write_predictions(conn, preds("ens-2", (0.70, 0.20, 0.10)))     # shadow model: never shown
    card = store.endpoint_match(conn, 1)
    assert (card["home"], card["away"]) == ("Arsenal", "Chelsea")
    assert card["p_home"] == pytest.approx(0.52) and card["p_away"] == pytest.approx(0.22)
    assert len(card["predictions"]) == 3
    assert len(store.endpoint_matches(conn, KO - timedelta(hours=12), KO + timedelta(hours=12))) == 1


def test_market_quote_ignores_closing_rows_and_finds_best_price(conn):
    q = {r["selection"]: r for r in store.endpoint_market(conn, 1)}
    assert float(q["home"]["odds_best"]) == pytest.approx(2.05) and q["home"]["best_book"] == "bet365"
    assert q["home"]["books"] == 2
    assert float(q["home"]["odds_open_median"]) == pytest.approx((2.20 + 2.05) / 2)


def test_value_bets_latest_run_and_append_only(conn):
    ids = store.write_predictions(conn, preds("ens-1", (0.55, 0.25, 0.20)))
    pid = {(1, "1x2", s): i for s, i in zip(("home", "draw", "away"), ids)}
    v = pd.DataFrame([{"match_id": 1, "market": "1x2", "selection": s, "odds": o, "implied": 1 / o, "p_fair": f,
                       "edge": e, "ev": ev_, "ev_low": evl, "confidence": c, "is_bet": b, "rank": rk,
                       "rejected_because": why, "sigma": 0.03, "model_spread": 0.01, "stake_share": st}
                      for s, o, f, e, ev_, evl, c, b, rk, why, st in (
                          ("home", 2.05, 0.48, 0.07, 0.1275, 0.02, 71, True, 1, "", 0.012),
                          ("draw", 3.50, 0.27, -0.02, -0.125, -0.2, 30, False, None, "edge under minimum", 0.0),
                          ("away", 3.90, 0.25, -0.05, -0.22, -0.3, 10, False, None, "edge under minimum", 0.0))])
    store.write_value_bets(conn, KO - timedelta(hours=2), v.assign(confidence=50, is_bet=False, rank=None,
                                                                   rejected_because="older run"), pid)
    store.write_value_bets(conn, KO - timedelta(hours=1), v, pid)
    bets = store.endpoint_value_bets(conn, KO - timedelta(hours=12), KO + timedelta(hours=12))
    assert [b["selection"] for b in bets] == ["home"] and bets[0]["confidence"] == 71
    every = store.endpoint_value_bets(conn, KO - timedelta(hours=12), KO + timedelta(hours=12), only_bets=False)
    assert len(every) == 3 and "older run" not in {b["rejected_because"] for b in every}
    with pytest.raises(psycopg.errors.RaiseException):
        conn.execute("UPDATE pe.value_bet SET confidence = 99")
    with pytest.raises(psycopg.errors.RaiseException):
        conn.execute("DELETE FROM pe.prediction")


def test_model_performance_log_loss_and_brier(conn):
    store.write_predictions(conn, preds("ens-1", (0.5, 0.3, 0.2)))
    conn.execute("INSERT INTO pe.result (match_id, home_goals, away_goals, available_at) VALUES (1, 2, 1, %s)",
                 (KO + timedelta(hours=2),))
    perf = store.endpoint_model_performance(conn)
    assert len(perf) == 1 and perf[0]["matches"] == 1
    assert perf[0]["log_loss"] == pytest.approx(0.6931, abs=1e-3)                  # -ln 0.5
    assert perf[0]["brier"] == pytest.approx(0.25 + 0.09 + 0.04)
