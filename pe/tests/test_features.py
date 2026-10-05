import numpy as np
import pandas as pd
import pytest

from engine.data import to_team_matches
from engine.features import context, fatigue, form, market, ratings, squad
from engine.features.build import build_features
from engine.pit import cutoffs


def test_elo_is_zero_sum_and_symmetric(league):
    h = ratings.elo_history(league["matches"])
    last = h.groupby("team")["elo"].last()
    # Two seasons with 20% regression in between: the mean stays at the initial rating.
    assert abs(last.mean() - 1500) < 1e-6
    assert ratings.elo_expected(0) == 0.5
    assert ratings.elo_expected(100) + ratings.elo_expected(-100) == pytest.approx(1)


def test_elo_ranks_true_strength(league):
    h = ratings.elo_history(league["matches"])
    last = h.groupby("team")["elo"].last()
    true = pd.Series({t: league["attack"][t] + league["defence"][t] for t in last.index})
    assert last.rank().corr(true.rank()) > 0.5


def test_devig_methods_sum_to_one_and_shin_shrinks_longshots():
    odds = np.array([1.40, 4.80, 8.50])
    for f in market.DEVIG.values():
        p = f(odds)
        assert p.sum() == pytest.approx(1, abs=1e-9)
        assert (p > 0).all()
    prop, shin = market.devig_proportional(odds), market.devig_shin(odds)
    assert shin[2] < prop[2] and shin[0] > prop[0]


def test_market_features_movement_and_cutoff():
    t0 = pd.Timestamp("2026-10-10 12:00", tz="UTC")
    odds = pd.DataFrame([
        dict(match_id=1, bookmaker="pinnacle", market="1x2", line=None, selection=s, odds=o, available_at=t0 - pd.Timedelta(days=2))
        for s, o in (("home", 2.10), ("draw", 3.40), ("away", 3.60))] + [
        dict(match_id=1, bookmaker="pinnacle", market="1x2", line=None, selection=s, odds=o, available_at=t0 - pd.Timedelta(hours=3))
        for s, o in (("home", 1.90), ("draw", 3.50), ("away", 4.20))] + [
        # After the cutoff: ignored.
        dict(match_id=1, bookmaker="pinnacle", market="1x2", line=None, selection=s, odds=o, available_at=t0 - pd.Timedelta(minutes=5))
        for s, o in (("home", 1.50), ("draw", 4.0), ("away", 7.0))])
    targets = pd.DataFrame({"match_id": [1], "cutoff": [t0 - pd.Timedelta(hours=2)]})
    f = market.market_features(targets, odds)
    assert f["mkt_best_odds_home"].iloc[0] == 1.90
    assert f["mkt_move_home"].iloc[0] > 0  # home shortened from 2.10 to 1.90
    assert f["sharp_home"].iloc[0] == pytest.approx(f["mkt_home"].iloc[0])


def test_table_asof_counts_only_known_results(league):
    m = league["matches"]
    s = m[m["season"] == 2025].sort_values("kickoff")
    cutoff = s["kickoff"].iloc[25]
    tab = context.table_asof(m, "L1", 2025, cutoff)
    known = s[s["result_available_at"] < cutoff]
    assert tab["played"].sum() == 2 * len(known)
    assert list(tab["rank"]) == list(range(1, len(tab) + 1))


def test_fatigue_rest_days_and_congestion():
    k = lambda d: pd.Timestamp("2026-10-01", tz="UTC") + pd.Timedelta(days=d)
    m = pd.DataFrame([
        dict(match_id=1, league="L", kickoff=k(0), home_team="A", away_team="B"),
        dict(match_id=2, league="C", kickoff=k(3), home_team="C", away_team="A", kind="continental"),
        dict(match_id=3, league="L", kickoff=k(6), home_team="A", away_team="D"),
        dict(match_id=4, league="C", kickoff=k(9), home_team="A", away_team="E", kind="continental"),
    ])
    t = m[m["match_id"] == 3].assign(cutoff=k(6) - pd.Timedelta(hours=2))
    f = fatigue.fatigue_features(t, fatigue.team_schedule(m))
    assert f["home_rest_days"].iloc[0] == 3
    assert f["home_n7"].iloc[0] == 2 and f["away_n7"].iloc[0] == 0
    assert f["home_days_to_next"].iloc[0] == 3 and bool(f["home_next_is_continental"].iloc[0])


def test_window_and_decay_values():
    k = lambda d: pd.Timestamp("2026-01-01", tz="UTC") + pd.Timedelta(days=d)
    tm = pd.DataFrame({"team": ["A"] * 4, "available_at": [k(0), k(7), k(14), k(21)],
                       "is_home": [True] * 4, "x": [0.0, 1.0, 2.0, 3.0], "weight": [1.0] * 4})
    w = form.window_history(tm, ["x"], windows=(3,))
    assert w["x_l3"].tolist() == [0.0, 0.5, 1.0, 2.0]
    d = form.decayed_history(tm, ["x"], half_life_days=7)
    # Weights 1/8, 1/4, 1/2, 1 relative to the last match.
    expected = (0 * 0.125 + 1 * 0.25 + 2 * 0.5 + 3 * 1) / (0.125 + 0.25 + 0.5 + 1)
    assert d["x_dec"].iloc[-1] == pytest.approx(expected)


def test_missing_regular_weighs_more_than_missing_sub(league):
    m = league["matches"]
    target = m[m["season"] == 2025].iloc[[60]].assign(cutoff=lambda d: d["kickoff"] - pd.Timedelta(hours=2))
    team, mid, cut = target["home_team"].iloc[0], int(target["match_id"].iloc[0]), target["cutoff"].iloc[0]
    def missing(player):
        inj = pd.DataFrame([dict(match_id=mid, team=team, player=f"{team}-{player}", status="out",
                                 available_at=cut - pd.Timedelta(hours=1))])
        return squad.missing_player_features(target, league["player_stats"], inj)["home_missing_minutes"].iloc[0]
    assert missing("P3") > 0.9          # plays every minute
    assert missing("P11") < 0.3         # occasional substitute
    assert missing("P3") > missing("P11")


def test_build_features_shapes_and_no_target_rows_missing(league):
    m = league["matches"]
    targets = m[m["season"] == 2025].iloc[50:60]
    f = build_features(m, targets, "pre_lineup", team_stats=league["team_stats"], player_stats=league["player_stats"])
    assert len(f) == 10
    assert (f["cutoff"] == cutoffs(targets, "pre_lineup")).all()
    for col in ("elo_diff", "diff_d_xg_for_adj_dec", "home_rest_days", "home_gap_relegation", "h2h_gd_shrunk",
                "home_missing_minutes", "ad_xg_home_edge"):
        assert col in f.columns, col
        assert f[col].notna().all(), col


def test_elo_diff_predicts_goal_difference(league):
    m = league["matches"]
    targets = m[m["season"] == 2025]
    f = build_features(m, targets, "early", team_stats=league["team_stats"])
    gd = targets["home_goals"] - targets["away_goals"]
    assert f["elo_diff"].corr(gd) > 0.2
    assert f["ad_xg_home_edge"].corr(targets["home_goals"]) > 0.2
