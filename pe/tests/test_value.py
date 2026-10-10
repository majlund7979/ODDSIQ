import numpy as np
import pandas as pd
import pytest

from engine.value import engine as ev
from engine.value import quotes as q
from engine.value import uncertainty as unc

KO = pd.Timestamp("2025-03-01 15:00", tz="UTC")
CUT = KO - pd.Timedelta(hours=24)


def _odds(rows):
    return pd.DataFrame(rows, columns=["match_id", "bookmaker", "market", "line", "selection", "odds", "available_at", "kind"])


def book(b, h, d, a, at, mid="m1", kind="pre"):
    return [(mid, b, "1x2", None, s, o, at, kind) for s, o in zip(("home", "draw", "away"), (h, d, a))]


def market():
    early, late = CUT - pd.Timedelta(hours=48), CUT - pd.Timedelta(hours=2)
    rows = []
    for b, sh in (("pinnacle", 0.0), ("bet365", 0.05), ("unibet", 0.02)):
        rows += book(b, 2.30 + sh, 3.40, 3.20, early)
        rows += book(b, 2.00 + sh, 3.50, 3.90, late)                     # everyone shortens the home side
    rows += book("bet365", 1.50, 4.0, 7.0, CUT + pd.Timedelta(hours=1))  # after cutoff: must be ignored
    rows += book("pinnacle", 1.90, 3.6, 4.2, KO, kind="closing")         # closing: must be ignored
    return _odds(rows)


def test_quotes_use_only_prices_before_cutoff_and_report_movement():
    t = q.quotes(market(), "m1", "1x2", CUT).set_index("selection")
    assert t.loc["home", "odds_best"] == pytest.approx(2.05)          # bet365's latest pre-cutoff price
    assert t.loc["home", "odds_open"] == pytest.approx(2.32)          # median opening price
    assert t["p_fair"].sum() == pytest.approx(1.0, abs=0.01)
    assert t.loc["home", "move_logit"] > 0.15 and t.loc["home", "large_move"]
    assert t.loc["home", "books"] == 3 and 0 < t.loc["home", "margin"] < 0.1


def test_quotes_leave_out_a_bookmaker_whose_prices_are_not_a_book():
    clean = q.quotes(market(), "m1", "1x2", CUT).set_index("selection")
    early, late = CUT - pd.Timedelta(hours=48), CUT - pd.Timedelta(hours=1)
    exchange = book("betfair_ex_eu", 2.60, 3.30, 3.00, early) + book("betfair_ex_eu", 1.18, 1.10, 1.18, late)
    t = q.quotes(_odds(market().values.tolist() + exchange), "m1", "1x2", CUT).set_index("selection")
    assert t.loc["home", "books"] == 3
    for col in ("p_fair", "odds_open", "move_logit", "books_moved_same_way"):    # its sane opening prices are left out too
        pd.testing.assert_series_equal(t[col], clean[col])
    assert q.quotes(_odds(book("betfair_ex_eu", 1.18, 1.10, 1.18, late)), "m1", "1x2", CUT).empty


def test_confidence_falls_with_disagreement_and_is_50_at_zero_edge():
    sd_agree, sd_split = unc.sigma([0.01]), unc.sigma([0.08])
    assert unc.confidence([0.04], sd_agree)[0] > 75 > unc.confidence([0.04], sd_split)[0] > 50
    assert unc.confidence([0.0], sd_agree)[0] == pytest.approx(50)
    assert unc.sigma([0.01], n_eff=[5])[0] > unc.sigma([0.01], n_eff=[100])[0]
    assert unc.sigma([0.01], lineup_known=True)[0] < unc.sigma([0.01])[0]


def _preds(p_home, spread=0.01):
    p = {"home": p_home, "draw": (1 - p_home) * 0.5, "away": (1 - p_home) * 0.5}
    return pd.DataFrame([{"match_id": "m1", "league": "E0", "market": "1x2", "selection": s, "p": v, "p_model": v,
                          "model_spread": spread, "lineup_known": True} for s, v in p.items()])


def test_value_bet_needs_segment_edge_and_reasons_are_given():
    quotes = q.quotes(market(), "m1", "1x2", CUT)
    hist = pd.DataFrame([{"league": "E0", "market": "1x2", "bets": 900, "roi": 0.03, "mean_clv": 0.02, "has_edge": True}])
    v = ev.evaluate(_preds(0.60), quotes, hist).set_index("selection")
    assert v.loc["home", "is_bet"] and v.loc["home", "rank"] == 1
    assert v.loc["home", "ev"] == pytest.approx(0.60 * 2.05 - 1)
    assert v.loc["home", "ev_low"] < v.loc["home", "ev"]
    assert not v.loc["away", "is_bet"] and "edge under minimum" in v.loc["away", "rejected_because"]
    # Same bet without documented segment edge: rejected, with the reason.
    v2 = ev.evaluate(_preds(0.60), quotes, None).set_index("selection")
    assert not v2.loc["home", "is_bet"] and "ingen dokumenteret edge" in v2.loc["home", "rejected_because"]
    # Models disagree a lot: same edge, but EV at the lower bound turns negative.
    v3 = ev.evaluate(_preds(0.60, spread=0.12), quotes, hist).set_index("selection")
    assert not v3.loc["home", "is_bet"] and "EV negativ ved usikkerhed" in v3.loc["home", "rejected_because"]


def test_one_bet_per_market_and_ranking_table():
    quotes = q.quotes(market(), "m1", "1x2", CUT)
    hist = pd.DataFrame([{"league": "E0", "market": "1x2", "bets": 900, "roi": 0.03, "mean_clv": 0.02, "has_edge": True}])
    v = ev.evaluate(_preds(0.60), quotes, hist, f=ev.Filters(min_prob=0.0, min_edge=-1, min_ev_low=-1, min_confidence=0))
    assert v["rank"].notna().sum() == 1
    t = ev.ranking_table(v)
    assert list(t.columns[:9]) == ["rank", "match", "market", "odds", "model_p", "implied_p", "edge_pp", "ev_pct", "ev_low_pct"]
    assert "BEDSTE VALUE BET" in ev.match_card("A - B", {"home": 0.6, "draw": 0.2, "away": 0.2}, v)


def test_fit_recovers_prior_and_noise_and_finds_no_edge_when_there_is_none():
    rng = np.random.default_rng(1)
    n = 200000
    base_sd = rng.uniform(0.01, 0.04, n)
    p_fair = rng.uniform(0.25, 0.6, n)
    true_edge = rng.normal(0, 0.03, n)
    est = true_edge + rng.normal(0, 2 * base_sd)          # twice as noisy as the components claim
    won = rng.random(n) < p_fair + true_edge
    u = unc.fit(est, base_sd, won, p_fair)
    # tau and scale trade off along a ridge; what matters is the shrinkage they imply.
    for sd in (0.01, 0.025, 0.04):
        true_w = 0.03 ** 2 / (0.03 ** 2 + (2 * sd) ** 2)
        fitted_w = u.tau ** 2 / (u.tau ** 2 + (u.scale * sd) ** 2)
        assert abs(fitted_w - true_w) < 0.15, (sd, true_w, fitted_w, u)
    # No true edge at all: tau is fitted at (or very near) 0, so confidence stays near 50.
    won0 = rng.random(n) < p_fair
    u0 = unc.fit(est, base_sd, won0, p_fair)
    assert u0.tau <= 0.005
    assert np.abs(unc.confidence(est, base_sd, unc.Uncertainty(tau=max(u0.tau, 1e-4))) - 50).max() < 20
