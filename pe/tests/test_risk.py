import numpy as np
import pandas as pd
import pytest

from engine.models.scores import score_matrix
from engine.risk import kelly, limits
from engine.risk.payoff import Bet, correlation, payoff

M = score_matrix(1.7, 1.2, rho=-0.05)
P = M / M.sum()


def prob_win(b):
    return float((P * (payoff(b, M.shape) > 0)).sum())


def test_payoffs_match_score_matrix_markets():
    assert prob_win(Bet("m", "1x2", "home", 2.0)) == pytest.approx(np.tril(P, -1).sum())
    over = Bet("m", "ou", "over", 2.0, line=2.5)
    under = Bet("m", "ou", "under", 2.0, line=2.5)
    assert prob_win(over) + prob_win(under) == pytest.approx(1.0)
    # Quarter line: over 2.25 is half on 2.0 and half on 2.5.
    q = payoff(Bet("m", "ou", "over", 2.0, line=2.25), M.shape)
    assert q[1, 1] == pytest.approx(-0.5)          # 2 goals: half push, half lost
    assert q[2, 1] == pytest.approx(1.0)
    dnb = payoff(Bet("m", "dnb", "home", 1.5), M.shape)
    assert dnb[0, 0] == 0 and dnb[1, 0] == pytest.approx(0.5) and dnb[0, 1] == -1
    ah = payoff(Bet("m", "ah", "away", 1.9, line=0.25), M.shape)
    assert ah[1, 1] == pytest.approx(0.45) and ah[2, 1] == pytest.approx(-1.0)


def test_over_and_btts_are_strongly_correlated_and_opposites_negative():
    over = Bet("m", "ou", "over", 1.9, line=2.5)
    btts = Bet("m", "btts", "yes", 1.8)
    home_o15 = Bet("m", "team_ou", "home_over", 2.1, line=1.5)
    assert correlation(over, btts, M) > 0.5
    assert correlation(over, home_o15, M) > 0.4
    assert correlation(Bet("m", "1x2", "home", 2.0), Bet("m", "1x2", "away", 3.5), M) < -0.4


def test_joint_kelly_stakes_less_than_naive_on_correlated_bets():
    # Prices with a real edge on both: our probabilities are the matrix's.
    po, pb = prob_win(Bet("m", "ou", "over", 2, line=2.5)), prob_win(Bet("m", "btts", "yes", 2))
    bets = [Bet("m", "ou", "over", 1.08 / po, line=2.5), Bet("m", "btts", "yes", 1.08 / pb)]
    j, n = kelly.joint(bets, M), kelly.naive(bets, M)
    assert n.sum() > 0 and j.sum() < 0.8 * n.sum()
    # A single bet: joint Kelly equals the textbook formula.
    one = [Bet("m", "1x2", "home", 1.1 / prob_win(Bet("m", "1x2", "home", 2)))]
    assert kelly.joint(one, M)[0] == pytest.approx(kelly.single(prob_win(one[0]), one[0].odds), abs=1e-3)
    # No edge: no stake.
    fair = [Bet("m", "1x2", "draw", 0.97 / prob_win(Bet("m", "1x2", "draw", 2)))]
    assert kelly.joint(fair, M)[0] == 0


def test_limits_scale_in_order_and_brake_on_drawdown():
    s = pd.DataFrame({"match_id": ["a", "a", "b", "c", "d", "e", "f"], "league": ["E0"] * 4 + ["D1"] * 3,
                      "kelly": [0.2, 0.2, 0.05, 0.3, 0.3, 0.3, 0.001]})
    out = limits.apply(s)
    assert out["stake"].max() <= 0.02 + 1e-12
    assert out.loc[out.match_id == "a", "stake"].sum() <= 0.03 + 1e-12
    assert out.loc[out.league == "E0", "stake"].sum() <= 0.06 + 1e-12
    assert out["stake"].sum() <= 0.10 + 1e-12
    assert out.loc[6, "stake"] == 0                               # below the minimum stake
    small = s.iloc[:6].assign(kelly=s.kelly.iloc[:6] / 10)       # below every cap
    nomin = limits.RiskLimits(min_stake=0.0)
    braked, plain = limits.apply(small, nomin, drawdown=0.25), limits.apply(small, nomin)
    assert braked["stake"].sum() == pytest.approx(plain["stake"].sum() / 2)


def test_day_risk_is_reproducible_and_bounded():
    bets = [Bet("m1", "ou", "over", 2.0, line=2.5), Bet("m1", "btts", "yes", 1.9), Bet("m2", "1x2", "home", 2.1)]
    mats = {"m1": M, "m2": score_matrix(1.4, 1.1)}
    r1 = limits.day_risk(bets, mats, np.array([0.02, 0.01, 0.02]), seed=3)
    r2 = limits.day_risk(bets, mats, np.array([0.02, 0.01, 0.02]), seed=3)
    assert r1 == r2 and r1["var_5pct"] >= r1["max_loss"] - 1e-12 and 0 < r1["p_loss"] < 1
