"""Writes the engine's output to Postgres (schema pe) and reads what the endpoints serve.

Writes are append-only (the database refuses UPDATE/DELETE on these tables, see 002_api.sql):
a new prediction run is new rows, and the read views pick the newest. The site's route handlers
run the same SELECTs as `endpoint_*` below; keeping them here lets the tests check every
endpoint's shape against a real database.
"""
from __future__ import annotations

import json
from datetime import datetime

import pandas as pd

PREDICTION_COLS = ["match_id", "model_version", "feature_set", "stage", "market", "line", "selection",
                   "probability", "raw_probability", "calibrator", "market_probability", "best_odds",
                   "best_bookmaker_id", "confidence", "explanation", "data_as_of"]


def _val(v):
    if isinstance(v, (dict, list)):
        return json.dumps(v)
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    return v.item() if hasattr(v, "item") else v


def write_predictions(conn, rows: pd.DataFrame) -> list[int]:
    """rows: PREDICTION_COLS (missing ones are NULL). Returns the new prediction ids in row order."""
    cols = [c for c in PREDICTION_COLS if c in rows.columns]
    sql = (f"INSERT INTO pe.prediction ({', '.join(cols)}) VALUES ({', '.join(['%s'] * len(cols))}) RETURNING id")
    ids = []
    with conn.cursor() as cur:
        for r in rows[cols].itertuples(index=False):
            cur.execute(sql, [_val(v) for v in r])
            ids.append(cur.fetchone()[0])
    return ids


def write_value_bets(conn, run_at: datetime, v: pd.DataFrame, prediction_ids: dict) -> int:
    """v: output of engine.value.engine.evaluate (+ stake_share / capped_by from engine.risk.limits).
    prediction_ids: {(match_id, market, selection): prediction id}."""
    n = 0
    with conn.cursor() as cur:
        for r in v.itertuples(index=False):
            pid = prediction_ids[(r.match_id, r.market, r.selection)]
            cur.execute(
                """INSERT INTO pe.value_bet (prediction_id, run_at, odds, implied_probability, fair_probability, edge,
                       ev, ev_low, confidence, is_bet, rank, rejected_because, stake_share, capped_by, uncertainty)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                [pid, run_at, _val(r.odds), _val(r.implied), _val(r.p_fair), _val(r.edge), _val(r.ev), _val(r.ev_low),
                 int(r.confidence), bool(r.is_bet), _val(getattr(r, "rank", None)), r.rejected_because,
                 _val(getattr(r, "stake_share", 0.0)), getattr(r, "capped_by", None) or None,
                 json.dumps({"sigma": _val(r.sigma), "spread": _val(r.model_spread)})])
            n += 1
    return n


def _rows(conn, sql, params=()):
    with conn.cursor() as cur:
        cur.execute(sql, params)
        names = [d.name for d in cur.description]
        return [dict(zip(names, r)) for r in cur.fetchall()]


# ---------------------------------------------------------------- endpoints (point 40)

def endpoint_matches(conn, day_from, day_to):
    """GET /matches/today and /matches/upcoming."""
    return _rows(conn, "SELECT * FROM pe.match_card WHERE kickoff >= %s AND kickoff < %s ORDER BY kickoff", (day_from, day_to))


def endpoint_match(conn, match_id):
    """GET /match/{id} and /prediction/{id}: card + every latest prediction + value evaluation + market."""
    card = _rows(conn, "SELECT * FROM pe.match_card WHERE match_id = %s", (match_id,))
    if not card:
        return None
    return {**card[0],
            "predictions": _rows(conn, "SELECT market, line, selection, probability, market_probability, confidence, "
                                       "model_version, stage, data_as_of, explanation FROM pe.latest_prediction "
                                       "WHERE match_id = %s ORDER BY market, line, selection", (match_id,)),
            "value": _rows(conn, "SELECT market, line, selection, odds, probability, implied_probability, edge, ev, ev_low, "
                                 "confidence, is_bet, rank, rejected_because, stake_share FROM pe.latest_value_bet "
                                 "WHERE match_id = %s ORDER BY ev_low DESC", (match_id,)),
            "market": endpoint_market(conn, match_id)}


def endpoint_value_bets(conn, day_from, day_to, only_bets=True):
    """GET /value-bets: point 28's ranking table."""
    return _rows(conn, f"""SELECT v.match_id, mc.home, mc.away, mc.kickoff, v.market, v.line, v.selection, v.odds,
                                 v.probability, v.implied_probability, v.edge, v.ev, v.ev_low, v.confidence,
                                 v.stake_share, v.rejected_because
                          FROM pe.latest_value_bet v JOIN pe.match_card mc USING (match_id)
                          WHERE mc.kickoff >= %s AND mc.kickoff < %s {"AND v.is_bet" if only_bets else ""}
                          ORDER BY v.ev_low DESC""", (day_from, day_to))


def endpoint_market(conn, match_id):
    """GET /market/{match_id}."""
    return _rows(conn, "SELECT * FROM pe.market_quote WHERE match_id = %s ORDER BY market, line, selection", (match_id,))


def endpoint_model_performance(conn, is_backtest=False):
    """GET /model/performance (per model, competition, market, month)."""
    return _rows(conn, "SELECT * FROM pe.model_performance WHERE is_backtest = %s "
                       "ORDER BY month, model_version, competition, market", (is_backtest,))


def endpoint_backtest(conn, backtest_id=None):
    """GET /backtest: run list, or one run's config and summary."""
    if backtest_id is None:
        return _rows(conn, "SELECT id, name, started_at, finished_at FROM pe.backtest ORDER BY started_at DESC")
    r = _rows(conn, "SELECT * FROM pe.backtest WHERE id = %s", (backtest_id,))
    return r[0] if r else None
