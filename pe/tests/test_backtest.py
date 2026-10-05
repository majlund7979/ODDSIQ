import numpy as np
import pandas as pd
import pytest

from engine.backtest import betting, predictions, report
from engine.models.classifiers import CLASSES_1X2


def _toy(n=400, seed=0):
    """n matches with true probabilities, a noisy bet365 pre price and a sharp closing price."""
    rng = np.random.default_rng(seed)
    t0 = pd.Timestamp("2025-08-01 15:00", tz="UTC")
    true = rng.dirichlet([5, 3, 3], size=n)
    rows_m, rows_o, rows_p = [], [], []
    for k in range(n):
        mid = f"m{k}"
        ko = t0 + pd.Timedelta(days=k // 5)
        res = rng.choice(3, p=true[k])
        hg, ag = [(2, 0), (1, 1), (0, 1)][res]
        rows_m.append(dict(match_id=mid, league="L", kickoff=ko, home_goals=hg, away_goals=ag))
        noisy = true[k] * np.exp(rng.normal(0, 0.12, 3))
        noisy /= noisy.sum()
        for j, sel in enumerate(CLASSES_1X2):
            rows_o.append(dict(match_id=mid, bookmaker="bet365", market="1x2", line=None, selection=sel,
                               odds=round(1 / (noisy[j] * 1.05), 3), kind="pre", available_at=ko - pd.Timedelta(hours=30)))
            rows_o.append(dict(match_id=mid, bookmaker="pinnacle", market="1x2", line=None, selection=sel,
                               odds=round(1 / (true[k][j] * 1.02), 3), kind="closing", available_at=ko))
            rows_p.append(dict(match_id=mid, season=2025, market="1x2", line=None, selection=sel, p_model=true[k][j],
                               p_market=noisy[j], p_final=true[k][j], model_spread=0.0, blend_w=1.0))
    return pd.DataFrame(rows_m), pd.DataFrame(rows_o), pd.DataFrame(rows_p), true


def test_log_pool_endpoints_and_blend_fit():
    rng = np.random.default_rng(2)
    true = rng.dirichlet([5, 3, 3], size=3000)
    y = np.array([rng.choice(CLASSES_1X2, p=p) for p in true])
    noise = rng.dirichlet([2, 2, 2], size=3000)
    assert np.allclose(predictions.log_pool(true, noise, 1.0), true)
    assert np.allclose(predictions.log_pool(true, noise, 0.0), noise)
    # Market = truth, model = noise: trust the market. Model = truth, market = noise: trust the model.
    assert predictions.fit_blend(noise, true, y, CLASSES_1X2) < 0.15
    assert predictions.fit_blend(true, noise, y, CLASSES_1X2) > 0.85


def test_true_probabilities_find_value_with_positive_clv_and_caps_hold():
    m, o, p, _ = _toy(1500)
    s = betting.Strategy(min_edge=0.02, min_ev=0.03, max_stake=0.02, max_daily_exposure=0.05)
    c = betting.candidates(p, o, m, s)
    b = betting.simulate(c, s)
    assert len(b) > 100
    assert not b.duplicated(["match_id", "market"]).any()
    assert (b["stake"] <= s.max_stake * b["bankroll_before"] + 1e-9).all()
    daily = b.groupby(b["kickoff"].dt.date).agg(stake=("stake", "sum"), bank=("bankroll_before", "first"))
    assert (daily["stake"] <= s.max_daily_exposure * daily["bank"] + 1e-6).all()
    summary = report.bet_summary(b)
    # Betting the truth against a noisy price: closing line value and EV at close are positive.
    assert summary["mean_ev_at_close"] > 0
    assert summary["roi_ci90"][0] <= summary["roi"] <= summary["roi_ci90"][1]


def test_copying_the_market_places_no_bets():
    m, o, p, _ = _toy(300)
    p = p.assign(p_final=p["p_market"])
    s = betting.Strategy(min_edge=0.01)
    assert betting.simulate(betting.candidates(p, o, m, s), s).empty


def test_settlement_and_flat_stakes():
    m, o, p, _ = _toy(200)
    s = betting.Strategy(min_edge=0.0, min_ev=0.0, flat_stake=1.0)
    b = betting.simulate(betting.candidates(p, o, m, s), s)
    expected = np.where(b["won"], b["odds"] - 1, -1.0)
    assert np.allclose(b["profit"], expected)


def test_price_known_after_cutoff_is_rejected():
    m, o, p, _ = _toy(20)
    o.loc[o["kind"] == "pre", "available_at"] = o.loc[o["kind"] == "pre", "available_at"] + pd.Timedelta(hours=10)
    with pytest.raises(AssertionError):
        betting.candidates(p, o, m, betting.Strategy())


def test_af_export_pairs_on_date_score_and_name():
    from engine.sources import af_export
    ko = pd.Timestamp("2024-03-02 15:00", tz="UTC")
    matches = pd.DataFrame({"match_id": ["a", "b"], "league": ["E0", "E0"], "kickoff": [ko, ko],
                            "home_team": ["Man United", "Wolves"], "away_team": ["Chelsea", "Fulham"],
                            "home_goals": [1.0, 1.0], "away_goals": [0.0, 0.0]})
    af = pd.DataFrame({"fixture_id": [11, 12], "league": ["E0", "E0"],
                       "kickoff": [ko + pd.Timedelta(hours=2), ko - pd.Timedelta(hours=16)],  # 12 is the day before (UTC)
                       "home": ["Wolverhampton Wanderers", "Manchester United"], "away": ["Fulham", "Chelsea"],
                       "home_goals": [1, 1], "away_goals": [0, 0], "home_xg": [1.1, 2.0], "away_xg": [0.4, 0.9],
                       "home_shots_inside_box": [8, 12], "away_shots_inside_box": [3, 5]})
    p = af_export.pair(matches, af).set_index("match_id")["fixture_id"].to_dict()
    assert p == {"a": 12, "b": 11}
    ts = pd.DataFrame({"match_id": ["a", "a"], "team": ["Man United", "Chelsea"], "shots": [10, 5]})
    frames, _ = af_export.attach({"matches": matches, "team_stats": ts}, af)
    got = frames["team_stats"].set_index("team")
    assert got.loc["Man United", "xg"] == 2.0 and got.loc["Chelsea", "xg"] == 0.9 and got.loc["Chelsea", "shots_inside"] == 5
