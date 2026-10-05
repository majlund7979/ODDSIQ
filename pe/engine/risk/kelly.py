"""Fractional Kelly for several bets at once (spec points 29-30).

Bets on the same match are staked together: we maximise expected log bankroll over the exact
score distribution, so Over 2.5 + BTTS + home over 1.5 are not treated as three independent
bets (which would roughly double the real exposure). Bets on different matches are treated as
independent; each match gets its own optimum, then the limits in limits.py scale the day down.

The probabilities must be the step-6 view (edge shrunk by confidence), not the raw model: full
Kelly on an over-confident probability is the fastest way to ruin. The fraction (default 1/4)
is a further safety margin for model error.
"""
from __future__ import annotations

import numpy as np
from scipy.optimize import minimize

from engine.risk.payoff import Bet, payoff


def single(p: float, odds: float) -> float:
    """Full Kelly share for one bet: (p*odds - 1) / (odds - 1), never negative."""
    return max((p * odds - 1) / (odds - 1), 0.0)


def joint(bets: list[Bet], matrix: np.ndarray) -> np.ndarray:
    """Full Kelly shares for bets on ONE match, from the score matrix. Shares >= 0, sum <= 0.95."""
    p = (matrix / matrix.sum()).ravel()
    keep = p > 1e-12
    p = p[keep]
    R = np.stack([payoff(b, matrix.shape).ravel()[keep] for b in bets], axis=1)   # scores x bets

    def neg(f):
        w = 1 + R @ f
        return -np.sum(p * np.log(np.maximum(w, 1e-9)))

    def grad(f):
        w = np.maximum(1 + R @ f, 1e-9)
        return -(R * (p / w)[:, None]).sum(axis=0)

    n = len(bets)
    start = np.array([min(single(float((p * (R[:, i] > 0)).sum()), b.odds), 0.1) for i, b in enumerate(bets)])
    res = minimize(neg, start, jac=grad, method="SLSQP", bounds=[(0, 0.95)] * n,
                   constraints=[{"type": "ineq", "fun": lambda f: 0.95 - f.sum()}])
    f = np.clip(res.x, 0, None)
    f[f < 1e-6] = 0.0
    return f


def naive(bets: list[Bet], matrix: np.ndarray) -> np.ndarray:
    """Each bet's own Kelly share as if independent (what NOT to do, kept for comparison)."""
    p = matrix / matrix.sum()
    return np.array([single(float((p * (payoff(b, matrix.shape) > 0)).sum()), b.odds) for b in bets])
