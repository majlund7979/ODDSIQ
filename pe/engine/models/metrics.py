"""Probability scoring. Log loss is the main metric (it punishes confident mistakes);
Brier and RPS (ranked probability score, respects home < draw < away order) are reported too."""
from __future__ import annotations

import numpy as np
import pandas as pd


def one_hot(y, classes) -> np.ndarray:
    y = np.asarray(y)
    return np.stack([(y == c).astype(float) for c in classes], axis=1)


def log_loss(p: np.ndarray, y, classes) -> float:
    o = one_hot(y, classes)
    return float(-np.mean(np.log(np.clip((p * o).sum(axis=1), 1e-12, 1))))


def brier(p: np.ndarray, y, classes) -> float:
    return float(np.mean(((p - one_hot(y, classes)) ** 2).sum(axis=1)))


def rps(p: np.ndarray, y, classes) -> float:
    o = one_hot(y, classes)
    cp, co = np.cumsum(p, axis=1)[:, :-1], np.cumsum(o, axis=1)[:, :-1]
    return float(np.mean(((cp - co) ** 2).sum(axis=1) / (p.shape[1] - 1)))


def calibration_table(prob: np.ndarray, hit: np.ndarray, bins: int = 10) -> pd.DataFrame:
    """Per probability bin: mean predicted, observed frequency, count. Feeds the calibration curve."""
    edges = np.linspace(0, 1, bins + 1)
    b = np.clip(np.digitize(prob, edges) - 1, 0, bins - 1)
    df = pd.DataFrame({"bin": b, "p": prob, "hit": hit})
    t = df.groupby("bin").agg(predicted=("p", "mean"), observed=("hit", "mean"), n=("p", "size")).reset_index()
    t["lo"], t["hi"] = edges[t["bin"]], edges[t["bin"] + 1]
    return t


def ece(prob: np.ndarray, hit: np.ndarray, bins: int = 10) -> float:
    """Expected calibration error: count-weighted |predicted - observed|."""
    t = calibration_table(prob, hit, bins)
    return float((t["n"] * (t["predicted"] - t["observed"]).abs()).sum() / t["n"].sum())
