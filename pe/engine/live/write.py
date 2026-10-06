"""Writes a shadow run to schema pe (one transaction per run).

Reference rows (competition, season, team, match, bookmaker, feature set, model) are created when
missing; predictions, value bets, odds and features are only ever inserted (append-only).
Odds already stored for a match (same bookmaker, selection and observed_at) are not stored twice.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from engine import store
from engine.live.predict import Run

DIVISIONS = {"E0": ("Premier League", "England", 1), "E1": ("Championship", "England", 2),
             "D1": ("Bundesliga", "Germany", 1), "D2": ("2. Bundesliga", "Germany", 2),
             "SP1": ("La Liga", "Spain", 1), "SP2": ("LaLiga 2", "Spain", 2), "I1": ("Serie A", "Italy", 1),
             "I2": ("Serie B", "Italy", 2), "F1": ("Ligue 1", "France", 1), "F2": ("Ligue 2", "France", 2),
             "N1": ("Eredivisie", "Netherlands", 1), "P1": ("Primeira Liga", "Portugal", 1),
             "B1": ("Jupiler Pro League", "Belgium", 1), "SC0": ("Scottish Premiership", "Scotland", 1),
             "T1": ("Süper Lig", "Turkey", 1), "G1": ("Super League", "Greece", 1)}


def _one(cur, sql, params):
    cur.execute(sql, params)
    r = cur.fetchone()
    return r[0] if r else None


def _competition(cur, division: str) -> int:
    name, country, tier = DIVISIONS[division]
    cid = _one(cur, "SELECT id FROM pe.competition WHERE fd_division = %s", (division,))
    return cid or _one(cur, "INSERT INTO pe.competition (fd_division, name, country, kind, tier) VALUES (%s,%s,%s,'league',%s) "
                            "RETURNING id", (division, name, country, tier))


def _season(cur, competition_id: int, year: int) -> int:
    cur.execute("INSERT INTO pe.season (competition_id, year) VALUES (%s,%s) ON CONFLICT DO NOTHING", (competition_id, year))
    return _one(cur, "SELECT id FROM pe.season WHERE competition_id = %s AND year = %s", (competition_id, year))


def _team(cur, history_name: str, site_name: str) -> int:
    tid = _one(cur, "SELECT team_id FROM pe.team_alias WHERE source = 'football-data' AND alias = %s", (history_name,))
    if tid is None:
        tid = _one(cur, "INSERT INTO pe.team (name) VALUES (%s) RETURNING id", (history_name,))
        cur.execute("INSERT INTO pe.team_alias (source, alias, team_id) VALUES ('football-data', %s, %s)", (history_name, tid))
    cur.execute("INSERT INTO pe.team_alias (source, alias, team_id) VALUES ('site', %s, %s) ON CONFLICT DO NOTHING",
                (site_name, tid))
    return tid


def _match(cur, r) -> int:
    mid = _one(cur, "SELECT id FROM pe.match WHERE site_event_id = %s", (r.event_id,))
    if mid is not None:
        cur.execute("UPDATE pe.match SET kickoff = %s WHERE id = %s AND kickoff <> %s", (r.kickoff, mid, r.kickoff))
        return mid
    season = _season(cur, _competition(cur, r.league), int(r.season))
    afid = None if pd.isna(r.af_fixture_id) else int(r.af_fixture_id)
    if afid is not None and _one(cur, "SELECT id FROM pe.match WHERE af_fixture_id = %s", (afid,)):
        afid = None    # the fixture id already belongs to another row; keep the site link as the key
    return _one(cur, """INSERT INTO pe.match (af_fixture_id, site_event_id, season_id, kickoff, home_team_id, away_team_id, status)
                        VALUES (%s,%s,%s,%s,%s,%s,'scheduled') RETURNING id""",
                (afid, r.event_id, season, r.kickoff, _team(cur, r.home_team, r.site_home), _team(cur, r.away_team, r.site_away)))


def _bookmakers(cur, keys) -> dict:
    for k in keys:
        cur.execute("INSERT INTO pe.bookmaker (key, sharp) VALUES (%s, %s) ON CONFLICT DO NOTHING", (k, k == "pinnacle"))
    cur.execute("SELECT key, id FROM pe.bookmaker WHERE key = ANY(%s)", (list(keys),))
    return dict(cur.fetchall())


def _odds(cur, odds: pd.DataFrame, ids: dict, books: dict) -> int:
    if odds.empty:
        return 0
    cur.execute("SELECT match_id, bookmaker_id, market, selection, observed_at FROM pe.odds_snapshot WHERE match_id = ANY(%s)",
                (list(set(ids.values())),))
    have = {(m, b, mk, s, pd.Timestamp(t)) for m, b, mk, s, t in cur.fetchall()}
    rows = []
    for r in odds.itertuples(index=False):
        key = (ids[r.match_id], books[r.bookmaker], r.market, r.selection, pd.Timestamp(r.available_at))
        if key in have:
            continue
        rows.append((key[0], key[1], r.market, None if pd.isna(r.line) else float(r.line), r.selection, float(r.odds), key[4]))
        have.add(key)
    if rows:
        cur.executemany("""INSERT INTO pe.odds_snapshot (match_id, bookmaker_id, market, line, selection, odds, observed_at, kind, source)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,'snapshot','site')""", rows)
    return len(rows)


def model_version(run: Run, code_sha: str) -> str:
    return f"ens-{run.now:%Y%m%d}-{(code_sha or 'local')[:7]}"


def write(conn, run: Run, code_sha: str) -> dict:
    """Everything in one transaction; returns counts."""
    version = model_version(run, code_sha)
    fs = run.model["feature_set"]
    with conn.transaction(), conn.cursor() as cur:
        ids = {r.match_id: _match(cur, r) for r in run.matches.itertuples(index=False)}
        books = _bookmakers(cur, sorted(set(run.odds["bookmaker"])) or [])
        n_odds = _odds(cur, run.odds[run.odds["match_id"].isin(ids)], ids, books)
        cur.execute("INSERT INTO pe.feature_set (version, features, code_sha) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING",
                    (fs, json.dumps([[f, 1] for f in run.feature_names]), code_sha or "local"))
        hist = run.matches  # trained on football-data history up to the validation season
        cur.execute("""INSERT INTO pe.model (version, family, feature_set, params, trained_from, trained_to, code_sha, status, evaluation)
                       VALUES (%s,'ensemble',%s,%s,%s,%s,%s,'shadow',%s) ON CONFLICT DO NOTHING""",
                    (version, fs, json.dumps(run.model, default=str), f"{min(run.model['train'])}-07-01",
                     f"{run.model['validate'] + 1}-06-30", code_sha or "local",
                     json.dumps(run.model["validation"], default=float)))
        stage = hist.set_index("match_id")["stage"]
        feat_rows = [(ids[r.match_id], fs, stage[r.match_id], r.cutoff,
                      json.dumps({f: (None if pd.isna(getattr(r, f)) else float(getattr(r, f))) for f in run.feature_names}))
                     for r in run.features.itertuples(index=False)]
        n_feat = 0
        if feat_rows:
            cur.executemany("""INSERT INTO pe.match_feature (match_id, feature_set, stage, cutoff, values)
                               VALUES (%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING""", feat_rows)
            n_feat = cur.rowcount
        p = run.preds.copy()
        best = (run.value.set_index(["match_id", "market", "selection"])[["odds", "best_book"]]
                if len(run.value) else pd.DataFrame(columns=["odds", "best_book"]))
        rows = pd.DataFrame({
            "match_id": p["match_id"].map(ids), "model_version": version, "feature_set": fs,
            "stage": p["match_id"].map(stage), "market": p["market"], "line": p["line"], "selection": p["selection"],
            "probability": p["p"], "raw_probability": p["p_model"], "calibrator": run.model["calibrator"],
            "market_probability": p["p_market"],
            "best_odds": [best["odds"].get(k, np.nan) for k in zip(p["match_id"], p["market"], p["selection"])],
            "best_bookmaker_id": [books.get(best["best_book"].get(k)) for k in zip(p["match_id"], p["market"], p["selection"])],
            "explanation": [{"p_model": round(a, 4), "p_market": None if pd.isna(b) else round(b, 4), "blend_w": round(w, 3)}
                            for a, b, w in zip(p["p_model"], p["p_market"], p["blend_w"])],
            "data_as_of": run.now.to_pydatetime()})
        pids = store.write_predictions(conn, rows)
        key = dict(zip(zip(rows["match_id"], rows["market"], rows["selection"]), pids))
        n_value = 0
        if len(run.value):
            v = run.value.assign(match_id=run.value["match_id"].map(ids))
            n_value = store.write_value_bets(conn, run.now.to_pydatetime(), v, key)
    return {"model_version": version, "matches": len(ids), "odds_rows": n_odds, "feature_rows": n_feat,
            "predictions": len(pids), "value_rows": n_value,
            "approved_bets": int(run.value["is_bet"].sum()) if len(run.value) else 0}


def log_run(conn, started_at, status: str, summary: dict, code_sha: str | None, version: str | None = None) -> None:
    with conn.cursor() as cur:
        cur.execute("""INSERT INTO pe.job_run (job, started_at, finished_at, status, code_sha, model_version, summary)
                       VALUES ('pe-predict', %s, now(), %s, %s, %s, %s)""",
                    (started_at, status, code_sha, version, json.dumps(summary, default=str)))
