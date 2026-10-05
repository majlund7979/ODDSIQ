"""Backtest metrics (spec points 32, 33, 42): accuracy and calibration of the probabilities,
and money metrics of the bets, with bootstrap intervals so luck is visible."""
from __future__ import annotations

import numpy as np
import pandas as pd

from engine.models.metrics import ece, log_loss


def bet_summary(b: pd.DataFrame, n_boot: int = 2000, seed: int = 0) -> dict:
    if b.empty:
        return {"bets": 0}
    roi = b["profit"].sum() / b["stake"].sum()
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(b), size=(n_boot, len(b)))
    boot = b["profit"].to_numpy()[idx].sum(axis=1) / b["stake"].to_numpy()[idx].sum(axis=1)
    curve = b["bankroll_after"] if "bankroll_after" in b else b["profit"].cumsum()
    dd = float((curve / curve.cummax() - 1).min())
    return {
        "bets": int(len(b)), "staked": float(b["stake"].sum()), "profit": float(b["profit"].sum()),
        "roi": float(roi), "roi_ci90": (float(np.quantile(boot, 0.05)), float(np.quantile(boot, 0.95))),
        "hit_rate": float(b["won"].mean()), "avg_odds": float(b["odds"].mean()),
        "expected_hit_rate": float(b["p_final"].mean()),
        "mean_clv": float(b["clv"].mean()), "share_positive_clv": float((b["clv"] > 0).mean()),
        "mean_ev_at_close": float(b["ev_at_close"].mean()), "max_drawdown": dd,
    }


def by(b: pd.DataFrame, col) -> pd.DataFrame:
    g = b.groupby(col)
    return pd.DataFrame({"bets": g.size(), "roi": g["profit"].sum() / g["stake"].sum(), "hit_rate": g["won"].mean(),
                         "avg_odds": g["odds"].mean(), "mean_clv": g["clv"].mean()})


def probability_report(preds: pd.DataFrame, matches: pd.DataFrame) -> pd.DataFrame:
    """Log loss and ECE of model, market and blended probabilities per market and season."""
    m = preds.merge(matches[["match_id", "home_goals", "away_goals"]], on="match_id")
    tot = m["home_goals"] + m["away_goals"]
    outcome = np.select([m["market"].eq("1x2") & (m["home_goals"] > m["away_goals"]),
                         m["market"].eq("1x2") & (m["home_goals"] == m["away_goals"]),
                         m["market"].eq("1x2"), tot > 2.5], ["home", "draw", "away", "over"], "under")
    m["hit"] = (m["selection"] == outcome).astype(float)
    rows = []
    for (mk, season), g in m.groupby(["market", "season"]):
        g = g[g["p_market"].notna()]
        classes = ["home", "draw", "away"] if mk == "1x2" else ["over", "under"]
        for col in ("p_model", "p_market", "p_final"):
            wide = g.pivot_table(index="match_id", columns="selection", values=col).reindex(columns=classes).dropna()
            y = g[g["hit"] == 1].set_index("match_id")["selection"].reindex(wide.index)
            rows.append({"market": mk, "season": season, "source": col, "matches": len(wide),
                         "log_loss": log_loss(wide.to_numpy(), y, classes),
                         "ece": ece(g[col].to_numpy(), g["hit"].to_numpy())})
    return pd.DataFrame(rows)
