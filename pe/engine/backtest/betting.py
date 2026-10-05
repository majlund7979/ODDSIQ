"""Betting simulation, day by day, as if live (spec points 23, 25, 29, 33).

At each match day the strategy sees only predictions made at the cutoff and the pre-match
prices (available_at < cutoff). Filters decide which bets are placed; stakes are fractional
Kelly with caps; one selection per match and market (the outcomes of one market are mutually
exclusive, and 1X2 + O/U on the same match share one exposure cap). Settlement uses the result,
CLV uses the closing price (known only after kickoff).
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from engine.features.market import devig_power


@dataclass(frozen=True)
class Strategy:
    name: str = "default"
    markets: tuple = ("1x2", "ou")
    bookmaker: str = "bet365"            # price we bet at (realistic for a Danish account)
    min_prob: float = 0.0
    min_edge: float = 0.02               # p_final - fair market probability
    min_ev: float = 0.03                 # p_final * odds - 1
    max_spread: float = 1.0              # model disagreement (std across members), 1X2 only
    min_odds: float = 1.3
    max_odds: float = 6.0
    kelly_fraction: float = 0.25
    max_stake: float = 0.02              # share of bankroll per bet
    max_daily_exposure: float = 0.10
    max_match_exposure: float = 0.03
    flat_stake: float | None = None      # set to e.g. 1.0 for flat-stake reporting
    start_bankroll: float = 1000.0


def candidates(preds: pd.DataFrame, odds: pd.DataFrame, matches: pd.DataFrame, s: Strategy) -> pd.DataFrame:
    pre = odds[(odds["bookmaker"] == s.bookmaker) & (odds["kind"] == "pre")]
    close = odds[(odds["bookmaker"] == "pinnacle") & (odds["kind"] == "closing")]
    key = ["match_id", "market", "selection"]
    c = preds[preds["market"].isin(s.markets)].merge(
        pre[key + ["odds", "available_at"]].rename(columns={"available_at": "odds_at"}), on=key, how="inner")
    # Fair closing probability (Pinnacle, de-vigged) for CLV.
    fair_close = []
    for (mid, mk), g in close.groupby(["match_id", "market"]):
        if (mk == "1x2" and len(g) == 3) or (mk == "ou" and len(g) == 2):
            p = devig_power(g["odds"].to_numpy())
            fair_close += [(mid, mk, sel, o, q) for sel, o, q in zip(g["selection"], g["odds"], p)]
    fc = pd.DataFrame(fair_close, columns=["match_id", "market", "selection", "close_odds", "close_fair"])
    c = c.merge(fc, on=key, how="left").merge(
        matches[["match_id", "league", "kickoff", "home_goals", "away_goals"]], on="match_id")
    c["cutoff"] = c["kickoff"] - pd.Timedelta(hours=24)
    assert (c["odds_at"] < c["cutoff"]).all(), "bet price must be known before the prediction cutoff"
    c["ev"] = c["p_final"] * c["odds"] - 1
    c["edge"] = c["p_final"] - c["p_market"]
    tot = c["home_goals"] + c["away_goals"]
    won = np.select(
        [c["selection"] == "home", c["selection"] == "draw", c["selection"] == "away",
         c["selection"] == "over", c["selection"] == "under"],
        [c["home_goals"] > c["away_goals"], c["home_goals"] == c["away_goals"], c["home_goals"] < c["away_goals"],
         tot > c["line"].fillna(2.5), tot < c["line"].fillna(2.5)], False)
    c["won"] = won.astype(bool)
    return c


def select(c: pd.DataFrame, s: Strategy) -> pd.DataFrame:
    f = c[(c["p_final"] >= s.min_prob) & (c["edge"] >= s.min_edge) & (c["ev"] >= s.min_ev) &
          (c["odds"] >= s.min_odds) & (c["odds"] <= s.max_odds) & c["p_market"].notna()]
    f = f[(f["market"] != "1x2") | (f["model_spread"] <= s.max_spread)]
    # One selection per match and market: the best EV.
    return f.sort_values("ev", ascending=False).drop_duplicates(["match_id", "market"])


def simulate(c: pd.DataFrame, s: Strategy) -> pd.DataFrame:
    """Chronological staking with bankroll, caps and settlement."""
    bets = select(c, s).sort_values(["kickoff", "match_id"])
    bank = s.start_bankroll
    out = []
    for day, g in bets.groupby(bets["kickoff"].dt.date, sort=True):
        day_cap = s.max_daily_exposure * bank
        used, per_match = 0.0, {}
        rows = []
        for r in g.sort_values("ev", ascending=False).itertuples(index=False):
            if s.flat_stake:
                stake = s.flat_stake
            else:
                b = r.odds - 1
                kelly = max((r.p_final * b - (1 - r.p_final)) / b, 0.0)
                stake = min(s.kelly_fraction * kelly, s.max_stake) * bank
                room = min(day_cap - used, s.max_match_exposure * bank - per_match.get(r.match_id, 0.0))
                stake = max(min(stake, room), 0.0)
            if stake < 0.01:
                continue
            used += stake
            per_match[r.match_id] = per_match.get(r.match_id, 0.0) + stake
            rows.append((r, stake))
        # All of a day's bets are placed before any of them settle.
        bank_before = bank
        for r, stake in rows:
            profit = stake * (r.odds - 1) if r.won else -stake
            bank += profit
            out.append({**r._asdict(), "stake": stake, "profit": profit, "bankroll_before": bank_before,
                        "clv": r.odds / r.close_odds - 1 if pd.notna(r.close_odds) else np.nan,
                        "ev_at_close": r.close_fair * r.odds - 1 if pd.notna(r.close_fair) else np.nan})
    b = pd.DataFrame(out)
    if len(b):
        b["bankroll_after"] = s.start_bankroll + b["profit"].cumsum()
    return b
