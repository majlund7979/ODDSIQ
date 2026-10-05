"""Shapes the engine works on, independent of the database.

matches: one row per match
  match_id, league, season, kickoff, home_team, away_team, venue_lat/lon (optional),
  referee (optional), home_goals/away_goals (NaN if unplayed), result_available_at,
  went_to_extra (bool)
team_matches: two rows per finished match, one per team (built by `to_team_matches`)
  match_id, team, opponent, is_home, kickoff, available_at, goals_for, goals_against,
  plus any `<stat>_for` / `<stat>_against` columns present in the team stats.
"""
from __future__ import annotations

import pandas as pd

TEAM_STATS = ["xg", "shots", "shots_on_target", "shots_inside", "corners", "fouls",
              "yellow_cards", "red_cards", "possession", "passes_accurate"]


def to_team_matches(matches: pd.DataFrame, team_stats: pd.DataFrame | None = None) -> pd.DataFrame:
    """Long format: each finished match twice, from each team's point of view.
    team_stats (optional): match_id, team, <stat>... for full time."""
    done = matches.dropna(subset=["home_goals", "away_goals"])
    base = ["match_id", "league", "season", "kickoff", "went_to_extra"]
    base = [c for c in base if c in done.columns]
    home = done[base].assign(team=done["home_team"], opponent=done["away_team"], is_home=True,
                             goals_for=done["home_goals"], goals_against=done["away_goals"],
                             available_at=done["result_available_at"])
    away = done[base].assign(team=done["away_team"], opponent=done["home_team"], is_home=False,
                             goals_for=done["away_goals"], goals_against=done["home_goals"],
                             available_at=done["result_available_at"])
    tm = pd.concat([home, away], ignore_index=True)
    if team_stats is not None and len(team_stats):
        stats = [c for c in TEAM_STATS if c in team_stats.columns]
        own = team_stats[["match_id", "team", *stats]].rename(columns={s: f"{s}_for" for s in stats})
        opp = team_stats[["match_id", "team", *stats]].rename(columns={"team": "opponent", **{s: f"{s}_against" for s in stats}})
        tm = tm.merge(own, on=["match_id", "team"], how="left").merge(opp, on=["match_id", "opponent"], how="left")
    tm["points"] = (tm["goals_for"] > tm["goals_against"]) * 3 + (tm["goals_for"] == tm["goals_against"]) * 1
    return tm.sort_values(["kickoff", "match_id", "is_home"], ascending=[True, True, False]).reset_index(drop=True)
