"""Goal models.

Model A, Poisson (team strengths): log lambda_home = mu + h + att_home - def_away,
                                   log lambda_away = mu + att_away - def_home.
Model B, Dixon-Coles: Model A + the low-score correlation rho.
Both are fitted by maximum likelihood with exponential time decay (xi) and a small
L2 penalty on team parameters (shrinks newly promoted teams to average).
Model A2, feature Poisson: Poisson GLM on the step-3 features for home and away goals separately.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from scipy.special import gammaln
from sklearn.linear_model import PoissonRegressor
from sklearn.pipeline import make_pipeline

from engine.models.prep import FeaturePrep
from engine.models.scores import dc_tau


@dataclass
class TeamStrengthModel:
    """Poisson (dixon_coles=False) or Dixon-Coles (True) team-strength goal model."""
    dixon_coles: bool = True
    half_life_days: float = 180.0
    l2: float = 0.5
    window_days: float = 3 * 365     # older matches weigh < 1/64 at a 180-day half-life
    params_: dict = field(default_factory=dict)

    def fit(self, matches: pd.DataFrame, as_of: pd.Timestamp) -> "TeamStrengthModel":
        d = matches[(matches["result_available_at"] < as_of) &
                    (matches["kickoff"] > as_of - pd.Timedelta(days=self.window_days))].dropna(subset=["home_goals", "away_goals"])
        teams = sorted(set(d["home_team"]) | set(d["away_team"]))
        idx = {t: k for k, t in enumerate(teams)}
        hi, ai = d["home_team"].map(idx).to_numpy(), d["away_team"].map(idx).to_numpy()
        x, y = d["home_goals"].to_numpy(float), d["away_goals"].to_numpy(float)
        age = (as_of - d["kickoff"]).dt.total_seconds().to_numpy() / 86400.0
        w = np.power(0.5, age / self.half_life_days)
        n = len(teams)

        def unpack(theta):
            mu, home = theta[0], theta[1]
            att, dfn = theta[2:2 + n], theta[2 + n:2 + 2 * n]
            rho = theta[-1] if self.dixon_coles else 0.0
            return mu, home, att - att.mean(), dfn - dfn.mean(), rho

        def nll(theta):
            mu, home, att, dfn, rho = unpack(theta)
            lh = np.exp(mu + home + att[hi] - dfn[ai])
            la = np.exp(mu + att[ai] - dfn[hi])
            ll = x * np.log(lh) - lh - gammaln(x + 1) + y * np.log(la) - la - gammaln(y + 1)
            g_lh, g_la = x - lh, y - la                       # d ll / d log lambda
            g_rho = 0.0
            if self.dixon_coles:
                tau = np.clip(dc_tau(x, y, lh, la, rho), 1e-10, None)
                ll = ll + np.log(tau)
                z0, z01, z10, z11 = (x == 0) & (y == 0), (x == 0) & (y == 1), (x == 1) & (y == 0), (x == 1) & (y == 1)
                g_lh = g_lh + np.where(z0, -lh * la * rho, 0) / tau + np.where(z01, lh * rho, 0) / tau
                g_la = g_la + np.where(z0, -lh * la * rho, 0) / tau + np.where(z10, la * rho, 0) / tau
                g_rho = (w * (np.where(z0, -lh * la, 0) + np.where(z01, lh, 0) + np.where(z10, la, 0) - z11) / tau).sum()
            g_lh, g_la = w * g_lh, w * g_la
            g_att = np.bincount(hi, g_lh, n) + np.bincount(ai, g_la, n)
            g_def = -(np.bincount(ai, g_lh, n) + np.bincount(hi, g_la, n))
            # Parameters are centred (att - mean att), so the gradient is centred too; plus the L2 term.
            g_att = g_att - g_att.mean() - 2 * self.l2 * att
            g_def = g_def - g_def.mean() - 2 * self.l2 * dfn
            f = -(w * ll).sum() + self.l2 * ((att ** 2).sum() + (dfn ** 2).sum())
            grad = -np.concatenate([[(g_lh + g_la).sum(), g_lh.sum()], g_att, g_def, [g_rho] if self.dixon_coles else []])
            return f, grad

        theta0 = np.concatenate([[np.log(1.3), 0.25], np.zeros(2 * n), [-0.05] if self.dixon_coles else []])
        bounds = [(None, None)] * (2 + 2 * n) + ([(-0.3, 0.3)] if self.dixon_coles else [])
        res = minimize(nll, theta0, jac=True, method="L-BFGS-B", bounds=bounds)
        mu, home, att, dfn, rho = unpack(res.x)
        self.params_ = {"mu": float(mu), "home": float(home), "rho": float(rho), "converged": bool(res.success),
                        "attack": dict(zip(teams, att)), "defence": dict(zip(teams, dfn)), "n_matches": int(len(d))}
        return self

    def expected_goals(self, home: str, away: str, neutral: bool = False) -> tuple[float, float, float]:
        p = self.params_
        ah, dh = p["attack"].get(home, 0.0), p["defence"].get(home, 0.0)
        aa, da = p["attack"].get(away, 0.0), p["defence"].get(away, 0.0)
        lh = np.exp(p["mu"] + (0 if neutral else p["home"]) + ah - da)
        la = np.exp(p["mu"] + aa - dh)
        return float(lh), float(la), p["rho"]


@dataclass
class FeaturePoissonModel:
    """Model A2: two Poisson GLMs (home goals, away goals) on step-3 features."""
    features: list[str]
    alpha: float = 1.0
    home_: object = None
    away_: object = None

    def fit(self, X: pd.DataFrame, home_goals: pd.Series, away_goals: pd.Series, sample_weight=None):
        self.home_ = make_pipeline(FeaturePrep(self.features), PoissonRegressor(alpha=self.alpha, max_iter=500))
        self.away_ = make_pipeline(FeaturePrep(self.features), PoissonRegressor(alpha=self.alpha, max_iter=500))
        self.home_.fit(X, home_goals, poissonregressor__sample_weight=sample_weight)
        self.away_.fit(X, away_goals, poissonregressor__sample_weight=sample_weight)
        return self

    def expected_goals(self, X: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
        return self.home_.predict(X), self.away_.predict(X)
