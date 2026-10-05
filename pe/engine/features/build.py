"""Builds the feature table for a set of target matches at one stage.

Every family reads through the cutoff, so the same function serves live
predictions and the historical backtest. The output carries the feature-set
version; step 5 decides which candidate features become 'accepted'.
"""
from __future__ import annotations

import pandas as pd

from engine.data import to_team_matches
from engine.features import context, fatigue, form, h2h, market, ratings, referee, squad
from engine.pit import cutoffs

FEATURE_SET_VERSION = "fs-2026.10.0-candidate"


def build_features(matches: pd.DataFrame, targets: pd.DataFrame, stage: str, *,
                   team_stats: pd.DataFrame | None = None, player_stats: pd.DataFrame | None = None,
                   injuries: pd.DataFrame | None = None, lineups: pd.DataFrame | None = None,
                   odds: pd.DataFrame | None = None, referee_history: pd.DataFrame | None = None,
                   coach_lineups: pd.DataFrame | None = None) -> pd.DataFrame:
    """matches: all matches (history + targets). targets: subset of matches to featurise."""
    t = targets.copy()
    t["cutoff"] = cutoffs(t, stage)
    if not (t["cutoff"] < t["kickoff"]).all():
        raise ValueError("A pre-match cutoff must be before kickoff.")
    parts = [t[["match_id", "league", "season", "kickoff", "home_team", "away_team", "cutoff"]]]

    # Ratings: home advantage per league is itself estimated as of the earliest cutoff in the batch,
    # which is conservative (never newer than any target's cutoff).
    hfa_goals = ratings.league_home_advantage(matches, t["cutoff"].min())
    hfa_elo = {lg: 0.0 + 160.0 * g for lg, g in hfa_goals.items()}  # ≈ goals → Elo points; refit in step 4
    elo_hist = ratings.elo_history(matches, league_home_adv=hfa_elo)
    parts.append(ratings.elo_features(t, elo_hist, league_home_adv=hfa_elo))
    parts.append(pd.DataFrame({"league_home_adv_goals": t["league"].map(hfa_goals)}, index=t.index))

    tm = to_team_matches(matches, team_stats)
    parts.append(ratings.attack_defence_features(t, ratings.attack_defence_history(tm), "ad_goals"))
    if "xg_for" in tm.columns and tm["xg_for"].notna().any():
        parts.append(ratings.attack_defence_features(
            t, ratings.attack_defence_history(tm, ratings.AttackDefenceParams(stat="xg")), "ad_xg"))

    # Form: Elo-expected points need the pre-match Elo diff per team-match.
    pre = tm[["match_id", "team", "opponent", "kickoff", "is_home", "league"]].rename(columns={"kickoff": "cutoff"})
    e_team = ratings.asof_join(pre, elo_hist, "team", ["elo"], target_by="team")["elo"].fillna(1500)
    e_opp = ratings.asof_join(pre, elo_hist, "team", ["elo"], target_by="opponent")["elo"].fillna(1500)
    hfa = pre["league"].map(hfa_elo).fillna(60.0) * pre["is_home"].map({True: 1, False: -1})
    elo_pre = pd.DataFrame({"match_id": pre["match_id"], "team": pre["team"], "elo_diff_for": e_team - e_opp + hfa})
    tm = form.add_match_level_signals(tm, elo_pre)
    stat_cols = ["goals_for", "goals_against", "gd", "points_vs_exp"]
    for s in ("xg", "shots", "shots_on_target", "corners", "yellow_cards"):
        if f"{s}_for" in tm.columns:
            stat_cols += [f"{s}_for", f"{s}_against"]
    if "xg_for" in tm.columns:
        tm = form.opponent_adjusted(tm, "xg")
        stat_cols += ["xg_for_adj", "xg_against_adj"]
    win = form.window_history(tm, ["points_vs_exp", "gd"] + (["xgd"] if "xgd" in tm else []))
    parts.append(form.team_form_features(t, win, [c for c in win.columns if c not in ("team", "available_at")], "w_"))
    dec = form.decayed_history(tm, stat_cols)
    parts.append(form.team_form_features(t, dec, [c for c in dec.columns if c not in ("team", "available_at")], "d_"))
    for venue in ("home", "away"):
        v = form.window_history(tm, ["gd", "goals_for", "goals_against"], windows=(10,), venue=venue)
        side_targets = t.assign(_team=t["home_team"] if venue == "home" else t["away_team"])
        vals = ratings.asof_join(side_targets, v, "team", [c for c in v.columns if c not in ("team", "available_at")],
                                 target_by="_team")
        parts.append(vals.add_prefix(f"{venue}_at{venue}_"))

    parts.append(fatigue.fatigue_features(t, fatigue.team_schedule(matches)))
    parts.append(context.context_features(t, matches))
    if coach_lineups is not None:
        parts.append(context.coach_change_features(t, coach_lineups))
    parts.append(h2h.h2h_features(t, matches))
    if player_stats is not None:
        parts.append(squad.missing_player_features(t, player_stats, injuries if injuries is not None else
                                                   pd.DataFrame(columns=["match_id", "team", "player", "status", "available_at"]),
                                                   lineups if stage == "post_lineup" else None))
    if odds is not None:
        parts.append(market.market_features(t, odds, "1x2", ("home", "draw", "away")))
        ou = market.market_features(t, odds, "ou", ("over", "under"), line=2.5)
        parts.append(ou.add_prefix("ou25_"))
    if referee_history is not None and "referee" in t.columns:
        parts.append(referee.referee_features(t, referee_history))
    meta = pd.DataFrame({"stage": stage, "feature_set": FEATURE_SET_VERSION}, index=t.index)
    return pd.concat([*parts, meta], axis=1)
