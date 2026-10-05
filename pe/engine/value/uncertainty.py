"""Confidence score 0-100 and the conservative probability (spec points 26-27).

Our estimated edge (p - fair market probability) is noisy. We model it as

    estimated edge = true edge + noise,  noise ~ N(0, sigma^2)
    true edge ~ N(0, tau^2)              (most true edges against a good market are close to 0)

    sigma^2 = scale^2 * ( spread^2           model disagreement (std across ensemble members)
                        + calib_se^2         the segment's historical calibration error
                        + 0.005 / n_eff      little history for these teams
                        + lineup_sd^2 )      pre-lineup predictions carry lineup uncertainty

The posterior of the true edge is normal with
    mean = edge * tau^2 / (tau^2 + sigma^2)          (the edge shrunk towards 0)
    sd   = sqrt(tau^2 * sigma^2 / (tau^2 + sigma^2))
and confidence = 100 * P(true edge > 0) = 100 * Phi(mean / sd).

So a big edge where the models disagree scores lower than a modest edge every model agrees on,
and if the backtest shows that our edges never come true, tau is fitted near 0 and nothing gets
high confidence. tau and scale are not set by hand: `fit` estimates them on backtest
predictions by maximum likelihood of the results (`won`).
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.stats import norm


@dataclass(frozen=True)
class Uncertainty:
    tau: float = 0.03               # prior sd of the true edge (fitted)
    scale: float = 1.0              # multiplier on sigma (fitted)
    lineup_sd: float = 0.015        # extra sd before lineups are known
    default_calib: float = 0.02     # ECE when the segment has no history


def sigma(spread, calib_se=None, n_eff=None, lineup_known=False, u: Uncertainty = Uncertainty()):
    spread = np.asarray(spread, dtype=float)
    calib = np.full_like(spread, u.default_calib) if calib_se is None else np.asarray(calib_se, dtype=float)
    var = spread ** 2 + calib ** 2
    if n_eff is not None:
        var = var + 0.005 / np.maximum(np.asarray(n_eff, dtype=float), 1.0)
    if not lineup_known:
        var = var + u.lineup_sd ** 2
    return u.scale * np.sqrt(var)


def posterior(edge, sd, u: Uncertainty = Uncertainty()):
    edge, sd = np.asarray(edge, dtype=float), np.asarray(sd, dtype=float)
    t2, s2 = u.tau ** 2, sd ** 2
    w = t2 / np.maximum(t2 + s2, 1e-12)
    return edge * w, np.sqrt(np.maximum(t2 * s2 / np.maximum(t2 + s2, 1e-12), 1e-12))


def confidence(edge, sd, u: Uncertainty = Uncertainty()) -> np.ndarray:
    mean, psd = posterior(edge, sd, u)
    return 100 * norm.cdf(mean / psd)


def fit(edge, base_sd, won, p_fair, taus=np.linspace(0.0, 0.06, 25), scales=np.linspace(0.5, 4.0, 15)) -> Uncertainty:
    """Maximum likelihood of the results: P(win) = p_fair + shrunk edge.
    base_sd is sigma() with scale 1. Returns the fitted Uncertainty."""
    edge, base_sd, p_fair = (np.asarray(a, dtype=float) for a in (edge, base_sd, p_fair))
    won = np.asarray(won, dtype=float)
    best, best_ll = Uncertainty(tau=0.0), -np.inf
    for t in taus:
        for s in scales:
            u = Uncertainty(tau=float(t), scale=float(s))
            mean, _ = posterior(edge, s * base_sd, u)
            p = np.clip(p_fair + mean, 1e-4, 1 - 1e-4)
            ll = np.sum(won * np.log(p) + (1 - won) * np.log(1 - p))
            if ll > best_ll + 1e-9:
                best, best_ll = u, ll
            if t == 0.0:
                break            # with tau = 0 the scale does not matter
    return best
