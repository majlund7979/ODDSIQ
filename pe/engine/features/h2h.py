"""Head-to-head, shrunk towards zero by sample size so a few old meetings cannot
dominate. Whether it adds anything beyond ratings is decided in step 5."""
from __future__ import annotations

import numpy as np
import pandas as pd


def h2h_features(targets: pd.DataFrame, matches: pd.DataFrame, last_n: int = 10, shrink_k: float = 5.0,
                 max_age_days: float = 365 * 6) -> pd.DataFrame:
    done = matches.dropna(subset=["home_goals"]).sort_values("kickoff")
    key = [frozenset(x) for x in zip(done["home_team"], done["away_team"])]
    pairs = {k: g for k, g in done.groupby(pd.Series(key, index=done.index), sort=False)}
    empty = done.iloc[0:0]
    rows = []
    for t in targets.itertuples(index=False):
        g = pairs.get(frozenset((t.home_team, t.away_team)), empty)
        pair = g[(g["result_available_at"] < t.cutoff) &
                 (g["kickoff"] > t.cutoff - pd.Timedelta(days=max_age_days))].tail(last_n)
        gd = np.where(pair["home_team"] == t.home_team, pair["home_goals"] - pair["away_goals"],
                      pair["away_goals"] - pair["home_goals"])
        same_venue = pair["home_team"] == t.home_team
        n = len(pair)
        rows.append({
            "h2h_n": n,
            "h2h_gd_shrunk": float(gd.sum() / (n + shrink_k)) if n else 0.0,
            "h2h_goals_shrunk": float((pair["home_goals"] + pair["away_goals"]).sum() + 2.6 * shrink_k) / (n + shrink_k),
            "h2h_same_venue_n": int(same_venue.sum()),
        })
    return pd.DataFrame(rows, index=targets.index)
