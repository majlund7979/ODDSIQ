"""Team form: windows of the last N matches and time-decayed averages, with
opponent adjustment and red-card down-weighting. Everything is read as of the
target's cutoff through `asof_join`, so a match never sees itself or later games.

Advanced form = performance relative to expectation, not W/D/L points:
  points_vs_exp = points - expected points from pre-match Elo
  xgd_vs_opp    = xG difference minus what the opponent usually allows/creates
Decay functions compared in step 5: exponential by days, exponential by matches,
and plain windows (3/5/10/20).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from engine.features.ratings import elo_expected
from engine.pit import asof_join

WINDOWS = (3, 5, 10, 20)


def add_match_level_signals(tm: pd.DataFrame, elo_pre: pd.DataFrame | None = None,
                            red_card_weight: float = 0.5) -> pd.DataFrame:
    """Per team-match: expected points from pre-match Elo, performance vs expectation and a weight.
    elo_pre (optional): match_id, team, elo_diff_for (team Elo + its home adv - opponent Elo)."""
    tm = tm.copy()
    if elo_pre is not None:
        tm = tm.merge(elo_pre, on=["match_id", "team"], how="left")
        p_win = tm["elo_diff_for"].map(elo_expected)
        # Elo gives an expected score (win=1, draw=.5); convert to expected points with a draw share.
        draw = 0.27 * (1 - (2 * p_win - 1) ** 2)
        tm["exp_points"] = 3 * (p_win - draw / 2) + draw
        tm["points_vs_exp"] = tm["points"] - tm["exp_points"]
    if "xg_for" in tm.columns:
        tm["xgd"] = tm["xg_for"] - tm["xg_against"]
    tm["gd"] = tm["goals_for"] - tm["goals_against"]
    # Matches with a red card (either side) say less about normal strength.
    if "red_cards_for" in tm.columns:
        reds = tm["red_cards_for"].fillna(0) + tm["red_cards_against"].fillna(0)
    else:
        reds = pd.Series(0, index=tm.index)
    tm["weight"] = np.where(reds > 0, red_card_weight, 1.0)
    return tm


def window_history(tm: pd.DataFrame, cols: list[str], windows=WINDOWS, venue: str | None = None) -> pd.DataFrame:
    """Rows (team, available_at, <col>_l<N>) = mean of the team's last N matches including this one.
    venue: None for all matches, 'home' or 'away' for that venue only."""
    d = tm if venue is None else tm[tm["is_home"] == (venue == "home")]
    d = d.sort_values(["team", "available_at"])
    out = d[["team", "available_at"]].copy()
    g = d.groupby("team", sort=False)
    for c in cols:
        for n in windows:
            out[f"{c}_l{n}"] = g[c].transform(lambda s, n=n: s.rolling(n, min_periods=1).mean())
    out["n_matches"] = g.cumcount() + 1
    return out


def decayed_history(tm: pd.DataFrame, cols: list[str], half_life_days: float = 120.0) -> pd.DataFrame:
    """Rows (team, available_at, <col>_dec, n_eff): weighted mean over all earlier matches with weight
    w_i = match weight * 0.5 ** (age_days / half_life). The ratio is independent of the read time, so the
    value stored after a match is the value at any later cutoff."""
    d = tm.sort_values(["team", "available_at"]).copy()
    lam = np.log(2) / half_life_days
    t = (d["available_at"] - pd.Timestamp("2000-01-01", tz="UTC")).dt.total_seconds() / 86400.0
    # Scale weights relative to a fixed origin: w = base * exp(lam * t). Cumulative sums per team.
    # Shift t per team to avoid overflow over long histories.
    t0 = t.groupby(d["team"]).transform("min")
    growth = np.exp(lam * (t - t0))
    w = d["weight"] * growth if "weight" in d else growth
    out = d[["team", "available_at"]].copy()
    g_w = w.groupby(d["team"]).cumsum()
    for c in cols:
        x = d[c]
        valid = x.notna()
        num = (w * x.fillna(0)).groupby(d["team"]).cumsum()
        den = (w * valid).groupby(d["team"]).cumsum()
        out[f"{c}_dec"] = num / den.replace(0, np.nan)
    # Effective sample size, normalised to the latest match (decays further at read time; good enough).
    out["n_eff_dec"] = g_w / growth
    return out


def opponent_adjusted(tm: pd.DataFrame, stat: str, half_life_days: float = 120.0) -> pd.DataFrame:
    """<stat>_for minus what the opponent usually conceded before this match (and the same for against).
    Positive = better than opponents normally allow. Uses the opponent's decayed history as of kickoff."""
    hist = decayed_history(tm, [f"{stat}_against", f"{stat}_for"], half_life_days)
    targets = tm[["opponent", "kickoff"]].rename(columns={"kickoff": "cutoff"})
    opp = asof_join(targets, hist, "team", [f"{stat}_against_dec", f"{stat}_for_dec"], target_by="opponent")
    out = tm.copy()
    out[f"{stat}_for_adj"] = tm[f"{stat}_for"] - opp[f"{stat}_against_dec"].values
    out[f"{stat}_against_adj"] = tm[f"{stat}_against"] - opp[f"{stat}_for_dec"].values
    return out


def team_form_features(targets: pd.DataFrame, history: pd.DataFrame, cols: list[str], tag: str = "") -> pd.DataFrame:
    """Join a history table (window or decayed) to both teams of each target; adds home-minus-away diffs."""
    h = asof_join(targets, history, "team", cols, target_by="home_team").add_prefix(f"home_{tag}")
    a = asof_join(targets, history, "team", cols, target_by="away_team").add_prefix(f"away_{tag}")
    out = pd.concat([h, a], axis=1)
    for c in cols:
        if c != "n_matches" and not c.startswith("n_eff"):
            out[f"diff_{tag}{c}"] = out[f"home_{tag}{c}"] - out[f"away_{tag}{c}"]
    return out
