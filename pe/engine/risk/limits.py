"""Exposure limits (spec point 29). All limits are shares of the bankroll at the start of the day.

Order: fractional Kelly per match -> cap per bet -> cap per match (correlated exposure) ->
cap per league per day -> cap per day. Each cap scales the stakes it covers proportionally,
so the relative sizes chosen by Kelly survive. A drawdown brake halves the Kelly fraction while
the bankroll is more than `brake_drawdown` below its peak.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class RiskLimits:
    kelly_fraction: float = 0.25
    max_stake: float = 0.02           # per bet
    max_match: float = 0.03           # all bets on one match together (correlated exposure)
    max_league_day: float = 0.06      # per league per day
    max_daily: float = 0.10           # per day
    min_stake: float = 0.001          # smaller stakes are dropped
    brake_drawdown: float = 0.20      # from peak
    brake_factor: float = 0.5


def apply(stakes: pd.DataFrame, lim: RiskLimits = RiskLimits(), drawdown: float = 0.0) -> pd.DataFrame:
    """stakes: one row per bet with match_id, league and kelly (full Kelly share, joint per match).
    Returns the frame with `stake` (share of bankroll) and `capped_by`."""
    s = stakes.copy()
    frac = lim.kelly_fraction * (lim.brake_factor if drawdown >= lim.brake_drawdown else 1.0)
    s["stake"] = frac * s["kelly"]
    s["capped_by"] = ""

    def cap(mask_groups, limit, label):
        for _, idx in mask_groups:
            tot = s.loc[idx, "stake"].sum()
            if tot > limit + 1e-12:
                s.loc[idx, "stake"] *= limit / tot
                s.loc[idx, "capped_by"] = label

    over = s["stake"] > lim.max_stake
    s.loc[over, "stake"] = lim.max_stake
    s.loc[over, "capped_by"] = "max pr. bet"
    cap(s.groupby("match_id").groups.items(), lim.max_match, "max pr. kamp")
    cap(s.groupby("league").groups.items(), lim.max_league_day, "max pr. liga")
    cap([("day", s.index)], lim.max_daily, "max pr. dag")
    s.loc[s["stake"] < lim.min_stake, "stake"] = 0.0
    return s


def day_risk(bets: list, matrices: dict, stakes: np.ndarray, n: int = 20000, seed: int = 0) -> dict:
    """Monte Carlo of a day's result (matches independent, bets within a match share the score).
    Returns expected return, P(loss), 5 % worst-day loss and the maximum possible loss."""
    from engine.risk.payoff import payoff
    rng = np.random.Generator(np.random.PCG64(seed))
    total = np.zeros(n)
    by_match: dict = {}
    for b, st in zip(bets, stakes):
        by_match.setdefault(b.match_id, []).append((b, st))
    for mid, items in by_match.items():
        m = matrices[mid]
        flat = (m / m.sum()).ravel()
        draw = rng.choice(flat.size, size=n, p=flat)
        for b, st in items:
            total += st * payoff(b, m.shape).ravel()[draw]
    return {"expected": float(total.mean()), "p_loss": float((total < 0).mean()),
            "var_5pct": float(np.quantile(total, 0.05)), "max_loss": float(-sum(stakes))}
