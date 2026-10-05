"""The most important test: changing anything known after the cutoff must not change features."""
import numpy as np
import pandas as pd

from engine.features.build import build_features


def _scramble_future(data, cutoff):
    rng = np.random.default_rng(1)
    m = data["matches"].copy()
    future = m["result_available_at"] >= cutoff
    m.loc[future, "home_goals"] = rng.integers(0, 9, future.sum())
    m.loc[future, "away_goals"] = rng.integers(0, 9, future.sum())
    ts = data["team_stats"].copy()
    fut_ids = set(m.loc[future, "match_id"])
    sel = ts["match_id"].isin(fut_ids)
    ts.loc[sel, ["xg", "shots", "red_cards"]] = 99
    ps = data["player_stats"].copy()
    ps.loc[ps["available_at"] >= cutoff, "minutes"] = 1
    return m, ts, ps


def test_features_ignore_everything_after_cutoff(league):
    m = league["matches"]
    target = m[(m["season"] == 2025)].iloc[[40]]
    injuries = pd.DataFrame([
        dict(match_id=int(target["match_id"].iloc[0]), team=target["home_team"].iloc[0],
             player=f"{target['home_team'].iloc[0]}-P9", status="out",
             available_at=target["kickoff"].iloc[0] - pd.Timedelta(hours=5)),
        # Reported after the pre-lineup cutoff: must be ignored at that stage.
        dict(match_id=int(target["match_id"].iloc[0]), team=target["home_team"].iloc[0],
             player=f"{target['home_team'].iloc[0]}-P8", status="out",
             available_at=target["kickoff"].iloc[0] - pd.Timedelta(minutes=30)),
    ])
    kw = dict(team_stats=league["team_stats"], player_stats=league["player_stats"], injuries=injuries)
    a = build_features(m, target, "pre_lineup", **kw)
    cutoff = a["cutoff"].iloc[0]
    m2, ts2, ps2 = _scramble_future(league, cutoff)
    late_injury = pd.concat([injuries, injuries.assign(player=injuries["player"].str.replace("P9", "P0"),
                                                        available_at=cutoff + pd.Timedelta(minutes=1))])
    b = build_features(m2, target, "pre_lineup", team_stats=ts2, player_stats=ps2, injuries=late_injury)
    pd.testing.assert_frame_equal(a, b)


def test_target_result_is_not_used(league):
    m = league["matches"]
    target = m[m["season"] == 2025].iloc[[10]]
    a = build_features(m, target, "early", team_stats=league["team_stats"])
    m2 = m.copy()
    m2.loc[target.index, ["home_goals", "away_goals"]] = [9, 0]
    b = build_features(m2, target, "early", team_stats=league["team_stats"])
    pd.testing.assert_frame_equal(a, b)
