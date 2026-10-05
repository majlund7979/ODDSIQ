"""Referee tendencies for card/foul markets, shrunk to the league mean (empirical Bayes)."""
from __future__ import annotations

import pandas as pd


def referee_features(targets: pd.DataFrame, history: pd.DataFrame, prior_games: float = 10.0) -> pd.DataFrame:
    """history: match_id, league, referee, cards_total, fouls_total, available_at."""
    rows = []
    for t in targets.itertuples(index=False):
        ref = getattr(t, "referee", None)
        h = history[(history["available_at"] < t.cutoff) & (history["league"] == t.league)]
        if h.empty:
            rows.append({})
            continue
        lg_cards, lg_fouls = h["cards_total"].mean(), h["fouls_total"].mean()
        r = h[h["referee"] == ref] if ref else h.iloc[0:0]
        n = len(r)
        rows.append({
            "ref_games": n,
            "ref_cards": (r["cards_total"].sum() + prior_games * lg_cards) / (n + prior_games),
            "ref_fouls": (r["fouls_total"].sum() + prior_games * lg_fouls) / (n + prior_games),
            "league_cards": lg_cards,
        })
    return pd.DataFrame(rows, index=targets.index)
