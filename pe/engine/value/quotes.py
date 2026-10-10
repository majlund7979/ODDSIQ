"""Market view per match, market and selection at a cutoff (spec points 16-18).

Only prices with available_at < cutoff are used. For every selection: opening, current (latest
per bookmaker), average, median and best price, the fair (de-vigged) consensus probability, the
sharp bookmaker's fair probability, margin, number of bookmakers and the movement since opening.

Movement is reported as a fact (how far the consensus moved, in log-odds, and how many bookmakers
moved the same way). It is never labelled "smart money": whether a movement pattern predicts
anything is tested in the backtest (trin-6, section 6), not assumed.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from engine.features.market import DEVIG, real_book

SELECTIONS = {"1x2": ("home", "draw", "away"), "ou": ("over", "under"), "btts": ("yes", "no"),
              "dnb": ("home", "away"), "ah": ("home", "away")}


def _logit(p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return np.log(p / (1 - p))


def quotes(odds: pd.DataFrame, match_id: str, market: str, cutoff: pd.Timestamp, line=None,
           sharp: str = "pinnacle", method: str = "power", steam_logit: float = 0.15) -> pd.DataFrame:
    """One row per selection; empty if no complete book (all selections priced) exists before cutoff."""
    sels = SELECTIONS[market]
    o = odds[(odds["match_id"] == match_id) & (odds["market"] == market) & (odds["available_at"] < cutoff)]
    if line is not None:
        o = o[o["line"] == line]
    if "kind" in o:
        o = o[o["kind"] != "closing"]
    if o.empty:
        return pd.DataFrame()
    o = o.sort_values("available_at")
    cur = o.groupby(["bookmaker", "selection"])["odds"].last().unstack().reindex(columns=list(sels)).dropna()
    opn = o.groupby(["bookmaker", "selection"])["odds"].first().unstack().reindex(columns=list(sels)).dropna()
    # A bookmaker whose prices are not a real book (engine.features.market.real_book) is left out of everything below.
    cur = cur[cur.apply(real_book, axis=1)] if len(cur) else cur
    opn = opn[opn.apply(real_book, axis=1)] if len(opn) else opn
    devig = DEVIG[method]
    fair = cur.apply(lambda r: pd.Series(devig(r.values), index=r.index), axis=1).dropna() if len(cur) else cur
    cur = cur.loc[fair.index]
    if cur.empty:
        return pd.DataFrame()
    fair0 = opn.apply(lambda r: pd.Series(devig(r.values), index=r.index), axis=1).dropna() if len(opn) else None
    rows = []
    for s in sels:
        best_book = cur[s].idxmax()
        rec = {"match_id": match_id, "market": market, "line": line, "selection": s,
               "books": len(cur), "odds_avg": cur[s].mean(), "odds_median": cur[s].median(),
               "odds_best": cur[s].max(), "best_book": best_book,
               "odds_open": opn[s].median() if len(opn) else np.nan,
               "p_fair": fair[s].median(), "p_sharp": fair.loc[sharp, s] if sharp in fair.index else np.nan,
               "margin": float((1 / cur).sum(axis=1).median() - 1),
               "book_disagreement": float(fair[s].std()) if len(fair) > 1 else 0.0}
        if fair0 is not None:
            common = fair.index.intersection(fair0.index)
            moves = _logit(fair.loc[common, s].to_numpy()) - _logit(fair0.loc[common, s].to_numpy())
            rec["move_logit"] = float(_logit(fair[s].median()) - _logit(fair0[s].median()))
            rec["books_moved_same_way"] = int((np.sign(moves) == np.sign(rec["move_logit"])).sum() * (abs(rec["move_logit"]) > 0))
            rec["large_move"] = bool(abs(rec["move_logit"]) >= steam_logit and rec["books_moved_same_way"] >= max(2, len(common) // 2))
        rows.append(rec)
    return pd.DataFrame(rows)
