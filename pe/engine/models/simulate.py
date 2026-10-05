"""Monte Carlo over the score distribution. Reproducible: the seed is derived from the
match id and model version, so the same prediction always gives the same simulation.
Used for combinations (e.g. Over 2.5 AND BTTS) and as a cross-check of the exact sums."""
from __future__ import annotations

import hashlib

import numpy as np


def seed_for(match_id, model_version: str) -> int:
    return int.from_bytes(hashlib.sha256(f"{match_id}|{model_version}".encode()).digest()[:8], "little")


def simulate_scores(matrix: np.ndarray, n: int = 100_000, seed: int = 0) -> tuple[np.ndarray, np.ndarray]:
    """n simulated (home, away) scores drawn from the score matrix."""
    rng = np.random.Generator(np.random.PCG64(seed))
    flat = matrix.ravel() / matrix.sum()
    draws = rng.choice(flat.size, size=n, p=flat)
    return np.divmod(draws, matrix.shape[1])


def summarise(h: np.ndarray, a: np.ndarray) -> dict[str, tuple[float, float]]:
    """Probability and its Monte Carlo standard error for the main markets."""
    n = len(h)
    events = {
        "home": h > a, "draw": h == a, "away": h < a,
        "over_2.5": h + a > 2, "under_2.5": h + a <= 2, "btts_yes": (h > 0) & (a > 0),
        "over_2.5_and_btts": (h + a > 2) & (h > 0) & (a > 0),
        "ah_home_-1.5": h - a > 1.5,
    }
    out = {}
    for k, e in events.items():
        p = float(e.mean())
        out[k] = (p, float(np.sqrt(p * (1 - p) / n)))
    return out
