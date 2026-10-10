"""Daily evaluation of the shadow runs (step 10, part 4) and the go-live rule.

Each run first settles matches that have finished: the score and the last price per bookmaker
before kickoff (the closing price) are copied from the site's tables into schema pe. Then every
settled prediction is scored against the market, and one row goes into pe.evaluation.

What is scored, per match and market (1X2, Over/Under 2.5), is the last prediction made before
kickoff, whatever model version made it:
- log loss of the engine's final probability, of the raw model and of the market (de-vigged
  consensus at prediction time). The paired difference final - market gets a 90 % bootstrap interval.
- CLV (closing line value) = odds taken x fair closing probability - 1, for the approved bets, for
  the side the raw model leans to (largest model - market gap) and for the most probable side.
- ROI at flat stakes for the approved bets and for the most probable side (the site's rule).

Go-live rule (step 5, point 43, applied to live shadow runs): the engine may be proposed for live
use when, on at least MIN_MATCHES settled 1X2 matches, its final probabilities have lower log loss
than the market with the whole 90 % interval below 0, or when at least MIN_BETS approved bets have
a mean CLV whose 90 % interval lies above 0. Passing only makes the engine eligible: the site's
"Dagens bedste bets" changes only when the owner says yes.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from engine.features.market import real_book
from engine.live import site

MIN_MATCHES = 500
MIN_BETS = 500
RULE = (f"log loss under markedet (hele 90 %-intervallet under 0) på mindst {MIN_MATCHES} afgjorte 1X2-kampe, "
        f"eller positiv CLV (hele 90 %-intervallet over 0) på mindst {MIN_BETS} godkendte bets")
CLASSES = {"1x2": ("home", "draw", "away"), "ou": ("over", "under")}


# ---------------------------------------------------------------- settle: results and closing prices

def settle(conn, now: pd.Timestamp) -> dict:
    """Copies scores and closing prices for finished matches. Returns counts."""
    with conn.cursor() as cur:
        cur.execute("""SELECT m.id, m.site_event_id, m.kickoff FROM pe.match m
                       WHERE m.site_event_id IS NOT NULL AND m.kickoff < %s
                         AND NOT EXISTS (SELECT 1 FROM pe.result r WHERE r.match_id = m.id)""",
                    (now - pd.Timedelta(hours=2),))
        open_ = pd.DataFrame(cur.fetchall(), columns=["match_id", "event_id", "kickoff"])
    if open_.empty:
        return {"results_settled": 0, "closing_rows": 0}
    with conn.cursor() as cur:
        cur.execute("""SELECT id, "homeScore", "awayScore" FROM "Event"
                       WHERE id = ANY(%s) AND status = 'finished' AND "homeScore" IS NOT NULL AND "awayScore" IS NOT NULL""",
                    (list(open_["event_id"]),))
        done = pd.DataFrame(cur.fetchall(), columns=["event_id", "home_goals", "away_goals"])
    done = open_.merge(done, on="event_id")
    if done.empty:
        return {"results_settled": 0, "closing_rows": 0}
    closing = _closing(site.odds(conn, done["event_id"]), done)
    with conn.transaction(), conn.cursor() as cur:
        books = {}
        for k in sorted(set(closing["bookmaker"])):
            cur.execute("INSERT INTO pe.bookmaker (key, sharp) VALUES (%s, %s) ON CONFLICT DO NOTHING", (k, k == "pinnacle"))
        if len(closing):
            cur.execute("SELECT key, id FROM pe.bookmaker WHERE key = ANY(%s)", (sorted(set(closing["bookmaker"])),))
            books = dict(cur.fetchall())
            cur.executemany("""INSERT INTO pe.odds_snapshot (match_id, bookmaker_id, market, line, selection, odds, observed_at, kind, source)
                               VALUES (%s,%s,%s,%s,%s,%s,%s,'closing','site')""",
                            [(int(r.match_id), books[r.bookmaker], r.market, None if pd.isna(r.line) else float(r.line),
                              r.selection, float(r.odds), r.available_at) for r in closing.itertuples(index=False)])
        cur.executemany("""INSERT INTO pe.result (match_id, home_goals, away_goals, available_at)
                           VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
                        [(int(r.match_id), int(r.home_goals), int(r.away_goals), now) for r in done.itertuples(index=False)])
    return {"results_settled": len(done), "closing_rows": len(closing)}


def _closing(odds: pd.DataFrame, matches: pd.DataFrame) -> pd.DataFrame:
    """The last price per bookmaker and selection observed before kickoff."""
    if odds.empty:
        return odds.assign(match_id=pd.Series(dtype=int))
    o = odds.merge(matches[["event_id", "match_id", "kickoff"]], on="event_id")
    o = o[o["available_at"] <= pd.to_datetime(o["kickoff"], utc=True)]
    o = o.sort_values("available_at").groupby(["match_id", "bookmaker", "market", "selection"], as_index=False).last()
    return o


# ---------------------------------------------------------------- score

def _load(conn) -> tuple[pd.DataFrame, pd.DataFrame]:
    with conn.cursor() as cur:
        cur.execute("""
            WITH last AS (
              SELECT DISTINCT ON (p.match_id, p.market, p.line, p.selection)
                     p.id, p.match_id, p.market, p.selection, p.probability, p.raw_probability, p.market_probability,
                     p.best_odds::float8 AS best_odds
              FROM pe.prediction p JOIN pe.match m ON m.id = p.match_id
              WHERE NOT p.is_backtest AND p.data_as_of < m.kickoff AND p.market IN ('1x2', 'ou')
                AND EXISTS (SELECT 1 FROM pe.result r WHERE r.match_id = p.match_id)
              ORDER BY p.match_id, p.market, p.line, p.selection, p.data_as_of DESC, p.id DESC)
            SELECT l.*, m.kickoff, r.home_goals, r.away_goals,
                   v.is_bet, v.odds::float8 AS bet_odds
            FROM last l JOIN pe.match m ON m.id = l.match_id JOIN pe.result r ON r.match_id = l.match_id
            LEFT JOIN LATERAL (SELECT * FROM pe.value_bet v WHERE v.prediction_id = l.id ORDER BY v.run_at DESC LIMIT 1) v ON true""")
        cols = [d.name for d in cur.description]
        preds = pd.DataFrame(cur.fetchall(), columns=cols)
        cur.execute("""SELECT c.match_id, c.bookmaker_id, c.market, c.selection, c.odds::float8 AS odds
                       FROM pe.odds_snapshot c WHERE c.kind = 'closing' AND c.market IN ('1x2', 'ou')""")
        closing = pd.DataFrame(cur.fetchall(), columns=["match_id", "bookmaker_id", "market", "selection", "odds"])
    return preds, closing


def fair_closing(closing: pd.DataFrame) -> pd.Series:
    """Median over bookmakers of the de-vigged closing probability, per match, market and selection."""
    if closing.empty:
        return pd.Series(dtype=float)
    c = closing.copy()
    c["inv"] = 1 / c["odds"]
    full = c.groupby(["match_id", "bookmaker_id", "market"])["selection"].transform("nunique")
    need = c["market"].map(lambda m: len(CLASSES[m]))
    c = c[full == need]
    # A bookmaker whose closing prices are not a real book (engine.features.market.real_book) is left out.
    ok = c.groupby(["match_id", "bookmaker_id", "market"])["odds"].transform(lambda o: real_book(o.to_numpy()))
    c = c[ok.astype(bool)]
    c["p"] = c["inv"] / c.groupby(["match_id", "bookmaker_id", "market"])["inv"].transform("sum")
    return c.groupby(["match_id", "market", "selection"])["p"].median()


def _ci(x: np.ndarray, n_boot=2000, seed=0) -> tuple[float, float]:
    if len(x) < 2:
        return (float("nan"), float("nan"))
    rng = np.random.default_rng(seed)
    means = x[rng.integers(0, len(x), (n_boot, len(x)))].mean(axis=1)
    return (float(np.quantile(means, 0.05)), float(np.quantile(means, 0.95)))


def _happened(r) -> bool:
    if r.market == "1x2":
        return {"home": r.home_goals > r.away_goals, "draw": r.home_goals == r.away_goals,
                "away": r.home_goals < r.away_goals}[r.selection]
    total = r.home_goals + r.away_goals
    return total > 2.5 if r.selection == "over" else total < 2.5


def _summary(x: np.ndarray) -> dict:
    lo, hi = _ci(x)
    return {"n": int(len(x)), "mean": float(x.mean()) if len(x) else None,
            "ci90": [lo, hi] if len(x) >= 2 else None}


def score(preds: pd.DataFrame, closing: pd.DataFrame) -> dict:
    """All numbers of one evaluation. preds: last prediction per selection with the result attached."""
    out: dict = {"markets": {}, "clv": {}, "roi": {}}
    if preds.empty:
        out.update(matches=0, period=None, eligible=False, rule=RULE, checks={"log_loss": False, "clv": False})
        return out
    p = preds.copy()
    p["won"] = [_happened(r) for r in p.itertuples(index=False)]
    fair = fair_closing(closing)
    p["p_close"] = [fair.get((m, mk, s), np.nan) for m, mk, s in zip(p["match_id"], p["market"], p["selection"])]

    for mk, classes in CLASSES.items():
        g = p[p["market"] == mk]
        complete = g.groupby("match_id")["selection"].transform("nunique") == len(classes)
        g = g[complete & g["market_probability"].notna() & g["raw_probability"].notna()]
        w = g[g["won"]]
        if w.empty:
            out["markets"][mk] = {"matches": 0}
            continue
        ll = lambda col: -np.log(np.clip(w[col].to_numpy(float), 1e-6, 1))  # noqa: E731
        final, model, market = ll("probability"), ll("raw_probability"), ll("market_probability")
        out["markets"][mk] = {
            "matches": int(len(w)), "log_loss_final": float(final.mean()), "log_loss_model": float(model.mean()),
            "log_loss_market": float(market.mean()), "diff_final_market": _summary(final - market),
            "diff_model_market": _summary(model - market),
        }

    def clv(rows: pd.DataFrame, odds_col: str) -> dict:
        r = rows[rows[odds_col].notna() & rows["p_close"].notna()]
        return _summary((r[odds_col] * r["p_close"] - 1).to_numpy(float))

    def roi(rows: pd.DataFrame, odds_col: str) -> dict:
        r = rows[rows[odds_col].notna()]
        return _summary(np.where(r["won"], r[odds_col] - 1, -1.0).astype(float))

    p["gap"] = p["raw_probability"] - p["market_probability"]
    keyed = p.dropna(subset=["gap"])
    lean = keyed.loc[keyed.groupby(["match_id", "market"])["gap"].idxmax()] if len(keyed) else keyed
    likely = p.loc[p.groupby(["match_id", "market"])["probability"].idxmax()]
    bets = p[p["is_bet"].fillna(False).astype(bool)]
    out["clv"] = {"bets": clv(bets, "bet_odds"), "model_lean": clv(lean, "best_odds"), "most_probable": clv(likely, "best_odds")}
    out["roi"] = {"bets": roi(bets, "bet_odds"), "most_probable": roi(likely, "best_odds")}

    m1 = out["markets"].get("1x2", {})
    d = m1.get("diff_final_market") or {}
    ll_ok = m1.get("matches", 0) >= MIN_MATCHES and d.get("ci90") is not None and d["ci90"][1] < 0
    c = out["clv"]["bets"]
    clv_ok = c["n"] >= MIN_BETS and c.get("ci90") is not None and c["ci90"][0] > 0
    kick = pd.to_datetime(p["kickoff"], utc=True)
    out.update(matches=int(p["match_id"].nunique()), period=[kick.min().isoformat(), kick.max().isoformat()],
               eligible=bool(ll_ok or clv_ok), rule=RULE, checks={"log_loss": bool(ll_ok), "clv": bool(clv_ok)},
               min_matches=MIN_MATCHES, min_bets=MIN_BETS)
    return out


def _clean(x):
    """jsonb has no NaN or infinity."""
    if isinstance(x, dict):
        return {k: _clean(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_clean(v) for v in x]
    if isinstance(x, (float, np.floating)):
        return float(x) if np.isfinite(x) else None
    if isinstance(x, np.integer):
        return int(x)
    return x


def evaluate(conn, now: pd.Timestamp, write: bool = True) -> dict:
    preds, closing = _load(conn)
    s = _clean(score(preds, closing))
    if write:
        period = s.get("period") or [None, None]
        with conn.cursor() as cur:
            cur.execute("""INSERT INTO pe.evaluation (evaluated_at, period_from, period_to, matches, eligible, summary)
                           VALUES (%s,%s,%s,%s,%s,%s)""",
                        (now, period[0], period[1], s["matches"], s["eligible"], json.dumps(s)))
    return s
