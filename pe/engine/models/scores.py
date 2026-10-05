"""Score distribution and every goal market derived from it.

A goal model gives expected goals (lambda_home, lambda_away) and, for
Dixon-Coles, a low-score correlation rho. The score matrix P[i, j] =
P(home scores i, away scores j) is computed exactly; all markets are sums over
it, so they are mutually consistent (O2.5 + U2.5 = 1, AH -0.5 = home win, ...).
Monte Carlo (simulate.py) is used for combinations of markets and as a check.
"""
from __future__ import annotations

import numpy as np
from scipy.stats import poisson

MAX_GOALS = 10


def dc_tau(i: np.ndarray, j: np.ndarray, lam_h: float, lam_a: float, rho: float) -> np.ndarray:
    """Dixon-Coles (1997) adjustment of the four low scores."""
    tau = np.ones(np.broadcast(i, j).shape)
    tau = np.where((i == 0) & (j == 0), 1 - lam_h * lam_a * rho, tau)
    tau = np.where((i == 0) & (j == 1), 1 + lam_h * rho, tau)
    tau = np.where((i == 1) & (j == 0), 1 + lam_a * rho, tau)
    tau = np.where((i == 1) & (j == 1), 1 - rho, tau)
    return tau


def score_matrix(lam_h: float, lam_a: float, rho: float = 0.0, max_goals: int = MAX_GOALS) -> np.ndarray:
    g = np.arange(max_goals + 1)
    m = np.outer(poisson.pmf(g, lam_h), poisson.pmf(g, lam_a))
    if rho:
        i, j = np.meshgrid(g, g, indexing="ij")
        m = m * dc_tau(i, j, lam_h, lam_a, rho)
    return m / m.sum()


def _ah_settle(diff: np.ndarray, line: float) -> tuple[np.ndarray, np.ndarray]:
    """Win and loss share per goal difference for a home Asian handicap `line` (quarter lines split)."""
    if abs(line * 4) % 2 == 1:  # quarter line: half stake on each neighbour
        lo, hi = line - 0.25, line + 0.25
        w1, l1 = _ah_settle(diff, lo)
        w2, l2 = _ah_settle(diff, hi)
        return (w1 + w2) / 2, (l1 + l2) / 2
    adj = diff + line
    return (adj > 0).astype(float), (adj < 0).astype(float)


def markets(m: np.ndarray, ou_lines=(0.5, 1.5, 2.5, 3.5, 4.5), ah_lines=(-2.5, -1.5, -1.0, -0.75, -0.5, -0.25, 0.0, 0.25, 0.5, 1.0, 1.5),
            team_lines=(0.5, 1.5, 2.5), top_scores: int = 12) -> dict[str, float]:
    """All markets as probabilities. Asian handicap returns the fair win/loss shares
    (push mass is excluded), so 'ah_home_-1.0' is P(win) and 'ah_home_-1.0_push' the refund share."""
    n = m.shape[0]
    i, j = np.meshgrid(np.arange(n), np.arange(n), indexing="ij")
    tot, diff = i + j, i - j
    out = {
        "home": float(m[diff > 0].sum()), "draw": float(m[diff == 0].sum()), "away": float(m[diff < 0].sum()),
        "btts_yes": float(m[(i > 0) & (j > 0)].sum()),
        "exp_home_goals": float((m * i).sum()), "exp_away_goals": float((m * j).sum()),
    }
    out["btts_no"] = 1 - out["btts_yes"]
    out["dc_1x"], out["dc_x2"], out["dc_12"] = out["home"] + out["draw"], out["draw"] + out["away"], out["home"] + out["away"]
    nd = out["home"] + out["away"]
    out["dnb_home"], out["dnb_away"] = out["home"] / nd, out["away"] / nd
    for L in ou_lines:
        out[f"over_{L}"] = float(m[tot > L].sum())
        out[f"under_{L}"] = 1 - out[f"over_{L}"]
    for L in team_lines:
        out[f"home_over_{L}"] = float(m[i > L].sum())
        out[f"away_over_{L}"] = float(m[j > L].sum())
    for L in ah_lines:
        w, lo = _ah_settle(diff, L)
        out[f"ah_home_{L}"] = float((m * w).sum())
        out[f"ah_home_{L}_lose"] = float((m * lo).sum())
        out[f"ah_home_{L}_push"] = 1 - out[f"ah_home_{L}"] - out[f"ah_home_{L}_lose"]
    flat = sorted(((float(m[a, b]), f"{a}-{b}") for a in range(n) for b in range(n)), reverse=True)
    for p, s in flat[:top_scores]:
        out[f"cs_{s}"] = p
    return out
