"""Market features: bookmaker margin removal, consensus, sharp price and movement.
The market is an input to the model (and the benchmark it must beat), not a
copy target: step 4 tests models with and without it.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.optimize import brentq


def devig_proportional(odds: np.ndarray) -> np.ndarray:
    p = 1.0 / np.asarray(odds, dtype=float)
    return p / p.sum()


def devig_power(odds: np.ndarray) -> np.ndarray:
    """p_i = (1/o_i) ** k with k chosen so the probabilities sum to 1 (handles favourite-longshot bias)."""
    q = 1.0 / np.asarray(odds, dtype=float)
    k = brentq(lambda k: (q ** k).sum() - 1.0, 0.5, 5.0)
    return q ** k


def devig_shin(odds: np.ndarray) -> np.ndarray:
    """Shin (1993): margin explained by a share z of insider money."""
    q = 1.0 / np.asarray(odds, dtype=float)
    s = q.sum()

    def probs(z):
        return (np.sqrt(z ** 2 + 4 * (1 - z) * q ** 2 / s) - z) / (2 * (1 - z))

    z = brentq(lambda z: probs(z).sum() - 1.0, 0.0, 0.4) if s > 1 else 0.0
    return probs(z)


DEVIG = {"proportional": devig_proportional, "power": devig_power, "shin": devig_shin}


def market_features(targets: pd.DataFrame, odds: pd.DataFrame, market: str = "1x2",
                    selections=("home", "draw", "away"), line=None, sharp: str = "pinnacle",
                    method: str = "power") -> pd.DataFrame:
    """Per target: de-vigged consensus (median over bookmakers of each bookmaker's fair probabilities),
    sharp fair probabilities, best odds, bookmaker disagreement, margin, and movement from the first
    snapshot to the latest one before the cutoff.
    odds: match_id, bookmaker, market, line, selection, odds, available_at."""
    o = odds[(odds["market"] == market)]
    if line is not None:
        o = o[o["line"] == line]
    devig = DEVIG[method]
    rows = []
    for t in targets.itertuples(index=False):
        m = o[(o["match_id"] == t.match_id) & (o["available_at"] < t.cutoff)]
        rec: dict = {}
        if m.empty:
            rows.append(rec)
            continue
        latest = m.sort_values("available_at").groupby(["bookmaker", "selection"]).last()["odds"].unstack()
        first = m.sort_values("available_at").groupby(["bookmaker", "selection"]).first()["odds"].unstack()
        latest = latest.reindex(columns=list(selections)).dropna()
        first = first.reindex(columns=list(selections)).dropna()
        if latest.empty:
            rows.append(rec)
            continue
        fair = latest.apply(lambda r: pd.Series(devig(r.values), index=r.index), axis=1)
        cons = fair.median()
        margin = (1.0 / latest).sum(axis=1)
        for s in selections:
            rec[f"mkt_{s}"] = float(cons[s])
            rec[f"mkt_best_odds_{s}"] = float(latest[s].max())
            rec[f"mkt_spread_{s}"] = float(fair[s].std()) if len(fair) > 1 else 0.0
        if sharp in fair.index:
            for s in selections:
                rec[f"sharp_{s}"] = float(fair.loc[sharp, s])
        if not first.empty:
            fair0 = first.apply(lambda r: pd.Series(devig(r.values), index=r.index), axis=1).median()
            for s in selections:
                p0, p1 = np.clip([fair0[s], cons[s]], 1e-4, 1 - 1e-4)
                rec[f"mkt_move_{s}"] = float(np.log(p1 / (1 - p1)) - np.log(p0 / (1 - p0)))
        rec["mkt_margin"] = float(margin.median() - 1)
        rec["mkt_books"] = int(len(latest))
        rows.append(rec)
    return pd.DataFrame(rows, index=targets.index)
