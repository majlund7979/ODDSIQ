"""Ensemble: weights found by minimising log loss of the combined probability on the
validation fold (never set by hand). Linear pooling with non-negative weights summing to 1
(softmax parametrisation). Model agreement = spread of the members' probabilities."""
from __future__ import annotations

import numpy as np
from scipy.optimize import minimize

from engine.models.metrics import one_hot


def fit_weights(member_probs: dict[str, np.ndarray], y, classes) -> dict[str, float]:
    """Non-negative weights summing to 1 that minimise validation log loss (SLSQP on the simplex)."""
    names = list(member_probs)
    P = np.stack([member_probs[n] for n in names])          # members × rows × classes
    o = one_hot(y, classes)
    hit = (P * o[None]).sum(axis=2)                          # members × rows: prob given to the outcome

    def loss(w):
        return -np.mean(np.log(np.clip(w @ hit, 1e-12, None)))

    def grad(w):
        return -(hit / np.clip(w @ hit, 1e-12, None)).mean(axis=1)

    k = len(names)
    res = minimize(loss, np.full(k, 1.0 / k), jac=grad, method="SLSQP", bounds=[(0.0, 1.0)] * k,
                   constraints=[{"type": "eq", "fun": lambda w: w.sum() - 1.0}])
    w = np.clip(res.x, 0, None)
    w = w / w.sum()
    return {n: float(round(v, 4)) for n, v in zip(names, w)}


def combine(member_probs: dict[str, np.ndarray], weights: dict[str, float]) -> np.ndarray:
    return sum(weights[n] * member_probs[n] for n in weights)


def agreement(member_probs: dict[str, np.ndarray], selection: int) -> np.ndarray:
    """Per row: standard deviation across models of P(selection). Low = models agree."""
    return np.stack([p[:, selection] for p in member_probs.values()]).std(axis=0)
