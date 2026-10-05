"""Team ratings updated after every match, read as of the prediction cutoff.

Elo: goal-difference weighted, league-specific home advantage, regression to the
mean between seasons. Attack/defence: exponentially smoothed goals (or xG) for
and against, relative to the opponent's strength at the time (a simple online
Poisson-style rating). All parameters are tuned in step 4/5 by walk-forward
log loss, never by hand; the defaults here are starting points.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import pandas as pd

from engine.pit import asof_join


@dataclass(frozen=True)
class EloParams:
    k: float = 20.0
    home_advantage: float = 60.0          # Elo points; overridden per league by `league_home_adv`
    initial: float = 1500.0
    season_regression: float = 0.2       # share pulled back to the league mean at a new season
    goal_diff_power: float = 0.5         # multiplier (1 + |gd|) ** power


def elo_expected(diff: float) -> float:
    return 1.0 / (1.0 + 10 ** (-diff / 400.0))


def elo_history(matches: pd.DataFrame, p: EloParams = EloParams(),
                league_home_adv: dict[str, float] | None = None) -> pd.DataFrame:
    """Rating rows (team, available_at, elo) after each finished match, in time order."""
    done = matches.dropna(subset=["home_goals", "away_goals"]).sort_values("result_available_at")
    rating: dict[object, float] = {}
    season_of: dict[object, object] = {}
    rows = []
    for m in done.itertuples(index=False):
        for t in (m.home_team, m.away_team):
            if t not in rating:
                rating[t] = p.initial
            elif season_of.get(t) != m.season:
                rating[t] = p.initial + (rating[t] - p.initial) * (1 - p.season_regression)
            season_of[t] = m.season
        hfa = 0.0 if getattr(m, "neutral", False) else (league_home_adv or {}).get(m.league, p.home_advantage)
        exp_home = elo_expected(rating[m.home_team] + hfa - rating[m.away_team])
        score = 1.0 if m.home_goals > m.away_goals else 0.5 if m.home_goals == m.away_goals else 0.0
        mult = (1 + abs(m.home_goals - m.away_goals)) ** p.goal_diff_power
        delta = p.k * mult * (score - exp_home)
        rating[m.home_team] += delta
        rating[m.away_team] -= delta
        rows.append((m.home_team, m.result_available_at, rating[m.home_team]))
        rows.append((m.away_team, m.result_available_at, rating[m.away_team]))
    return pd.DataFrame(rows, columns=["team", "available_at", "elo"])


def elo_features(targets: pd.DataFrame, history: pd.DataFrame, p: EloParams = EloParams(),
                 league_home_adv: dict[str, float] | None = None) -> pd.DataFrame:
    """Pre-match Elo for both teams as of each target's cutoff, and the implied home-win expectation."""
    home = asof_join(targets, history, "team", ["elo"], target_by="home_team")["elo"].fillna(p.initial)
    away = asof_join(targets, history, "team", ["elo"], target_by="away_team")["elo"].fillna(p.initial)
    hfa = targets["league"].map(lambda lg: (league_home_adv or {}).get(lg, p.home_advantage)).astype(float)
    hfa = hfa.where(~targets.get("neutral", pd.Series(False, index=targets.index)).astype(bool), 0.0)
    diff = home + hfa - away
    return pd.DataFrame({
        "elo_home": home, "elo_away": away, "elo_diff": diff,
        "elo_exp_home": diff.map(elo_expected),
    }, index=targets.index)


@dataclass(frozen=True)
class AttackDefenceParams:
    alpha: float = 0.08           # smoothing per match (≈ half-life of 8 matches)
    stat: str = "goals"           # 'goals' or 'xg'


def attack_defence_history(tm: pd.DataFrame, p: AttackDefenceParams = AttackDefenceParams()) -> pd.DataFrame:
    """Online multiplicative attack/defence ratings per team (log scale, league mean = 0).

    After a match: attack += alpha * log(observed_for / expected_for), where
    expected_for = league_mean * exp(attack_team - defence_opponent). Same for defence
    with goals against. Uses `<stat>_for` / `<stat>_against` columns (goals_for for goals).
    """
    col_for = "goals_for" if p.stat == "goals" else f"{p.stat}_for"
    col_against = "goals_against" if p.stat == "goals" else f"{p.stat}_against"
    att: dict[object, float] = {}
    dfn: dict[object, float] = {}
    league_mean: dict[object, float] = {}
    rows = []
    home_rows = tm[tm["is_home"]].sort_values("available_at")
    for r in home_rows.itertuples(index=False):
        h, a = r.team, r.opponent
        gh, ga = getattr(r, col_for), getattr(r, col_against)
        if pd.isna(gh) or pd.isna(ga):
            continue
        mu = league_mean.get(r.league, 1.35)
        exp_h = mu * math.exp(att.get(h, 0.0) - dfn.get(a, 0.0))
        exp_a = mu * math.exp(att.get(a, 0.0) - dfn.get(h, 0.0))
        # +0.5 smoothing keeps log finite for zero-goal games.
        att[h] = att.get(h, 0.0) + p.alpha * math.log((gh + 0.5) / (exp_h + 0.5))
        dfn[a] = dfn.get(a, 0.0) - p.alpha * math.log((gh + 0.5) / (exp_h + 0.5))
        att[a] = att.get(a, 0.0) + p.alpha * math.log((ga + 0.5) / (exp_a + 0.5))
        dfn[h] = dfn.get(h, 0.0) - p.alpha * math.log((ga + 0.5) / (exp_a + 0.5))
        league_mean[r.league] = 0.98 * mu + 0.02 * (gh + ga) / 2
        rows.append((h, r.available_at, att[h], dfn[h]))
        rows.append((a, r.available_at, att[a], dfn[a]))
    return pd.DataFrame(rows, columns=["team", "available_at", "attack", "defence"])


def attack_defence_features(targets: pd.DataFrame, history: pd.DataFrame, prefix: str = "ad") -> pd.DataFrame:
    h = asof_join(targets, history, "team", ["attack", "defence"], target_by="home_team").fillna(0.0)
    a = asof_join(targets, history, "team", ["attack", "defence"], target_by="away_team").fillna(0.0)
    return pd.DataFrame({
        f"{prefix}_home_attack": h["attack"], f"{prefix}_home_defence": h["defence"],
        f"{prefix}_away_attack": a["attack"], f"{prefix}_away_defence": a["defence"],
        # Log expected-goal ratios: home attack vs away defence and vice versa.
        f"{prefix}_home_edge": h["attack"] - a["defence"],
        f"{prefix}_away_edge": a["attack"] - h["defence"],
    }, index=targets.index)


def league_home_advantage(matches: pd.DataFrame, cutoff: pd.Timestamp, half_life_days: float = 365.0,
                          prior_matches: float = 200.0, prior_goal_diff: float = 0.3) -> dict[str, float]:
    """Per-league home advantage in goals (decayed mean of home minus away goals, shrunk to a prior),
    using only results available before `cutoff`."""
    done = matches[(matches["result_available_at"] < cutoff)].dropna(subset=["home_goals"])
    if "neutral" in done.columns:
        done = done[~done["neutral"].astype(bool)]
    age = (cutoff - done["result_available_at"]).dt.total_seconds() / 86400.0
    w = np.power(0.5, age / half_life_days)
    gd = done["home_goals"] - done["away_goals"]
    out = {}
    for lg, idx in done.groupby("league").groups.items():
        ww, g = w.loc[idx], gd.loc[idx]
        out[lg] = float((ww * g).sum() + prior_goal_diff * prior_matches) / float(ww.sum() + prior_matches)
    return out
