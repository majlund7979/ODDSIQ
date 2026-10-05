"""Calibration fitted on the validation fold only, never on the test fold.

Platt: logistic regression on the logit of each class probability (one-vs-rest), then renormalised.
Isotonic: monotone step function per class, then renormalised. Needs more data (≥ ~1,000 rows);
with less, Platt is safer. `choose` picks by validation log loss with a preference for
'none' unless calibration clearly helps (avoids fitting noise)."""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression

from engine.models.metrics import log_loss, one_hot


def _logit(p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))


@dataclass
class Calibrator:
    method: str = "platt"          # 'none' | 'platt' | 'isotonic'
    models_: list = field(default_factory=list)

    def fit(self, p: np.ndarray, y, classes) -> "Calibrator":
        o = one_hot(y, classes)
        self.models_ = []
        for k in range(p.shape[1]):
            if self.method == "platt":
                m = LogisticRegression(C=100.0).fit(_logit(p[:, [k]]), o[:, k])
            elif self.method == "isotonic":
                m = IsotonicRegression(out_of_bounds="clip", y_min=1e-4, y_max=1 - 1e-4).fit(p[:, k], o[:, k])
            else:
                m = None
            self.models_.append(m)
        return self

    def transform(self, p: np.ndarray) -> np.ndarray:
        if self.method == "none":
            return p
        cols = []
        for k, m in enumerate(self.models_):
            cols.append(m.predict_proba(_logit(p[:, [k]]))[:, 1] if self.method == "platt" else m.predict(p[:, k]))
        q = np.clip(np.stack(cols, axis=1), 1e-4, None)
        return q / q.sum(axis=1, keepdims=True)


def choose(p_val: np.ndarray, y_val, classes, min_gain: float = 0.002) -> Calibrator:
    """Cross-fitted choice: fit on half the validation fold, score on the other half, both ways."""
    n = len(p_val)
    idx = np.arange(n)
    halves = [(idx % 2 == 0), (idx % 2 == 1)]
    y_val = np.asarray(y_val)
    scores = {}
    for method in ("none", "platt", "isotonic"):
        s = []
        for a, b in (halves, halves[::-1]):
            c = Calibrator(method).fit(p_val[a], y_val[a], classes)
            s.append(log_loss(c.transform(p_val[b]), y_val[b], classes))
        scores[method] = float(np.mean(s))
    best = min(scores, key=scores.get)
    if scores["none"] - scores[best] < min_gain:
        best = "none"
    cal = Calibrator(best).fit(p_val, y_val, classes)
    cal.scores_ = scores
    return cal
