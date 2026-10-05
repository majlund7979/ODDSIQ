"""Outcome models on the step-3 features. Same interface for every family:
fit(X, y, sample_weight) and predict_proba(X) -> columns in CLASSES order.

Model C, Elo:     multinomial logistic regression on elo_diff only (a calibrated Elo).
Model D, LogReg:  multinomial logistic regression, L2, on all accepted features.
Model E, RF:      random forest, shallow-ish trees, min leaf size to limit overfitting.
Model F, LightGBM: gradient boosting with early stopping on the validation fold.
Model G, NN:      small MLP (sklearn). PyTorch only if this shows value (it rarely does on ~10k rows).
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import make_pipeline

from engine.models.prep import FeaturePrep

CLASSES_1X2 = ["home", "draw", "away"]


def outcome_1x2(home_goals: pd.Series, away_goals: pd.Series) -> pd.Series:
    return pd.Series(np.select([home_goals > away_goals, home_goals == away_goals], ["home", "draw"], "away"),
                     index=home_goals.index)


@dataclass
class OutcomeModel:
    family: str                      # 'elo' | 'logreg' | 'rf' | 'lgbm' | 'nn'
    features: list[str]
    classes: list[str] = field(default_factory=lambda: list(CLASSES_1X2))
    params: dict = field(default_factory=dict)
    seed: int = 0
    model_: object = None

    def _estimator(self):
        p = self.params
        if self.family in ("elo", "logreg"):
            return LogisticRegression(C=p.get("C", 0.1 if self.family == "logreg" else 10.0), max_iter=2000)
        if self.family == "rf":
            return RandomForestClassifier(n_estimators=p.get("n_estimators", 400), min_samples_leaf=p.get("min_samples_leaf", 40),
                                          max_features=p.get("max_features", 0.3), random_state=self.seed, n_jobs=-1)
        if self.family == "lgbm":
            return LGBMClassifier(n_estimators=p.get("n_estimators", 2000), learning_rate=p.get("learning_rate", 0.02),
                                  num_leaves=p.get("num_leaves", 8), min_child_samples=p.get("min_child_samples", 50),
                                  subsample=0.8, subsample_freq=1, colsample_bytree=0.7, reg_lambda=p.get("reg_lambda", 5.0),
                                  random_state=self.seed, verbose=-1)
        if self.family == "nn":
            return MLPClassifier(hidden_layer_sizes=p.get("hidden", (16,)), alpha=p.get("alpha", 1.0), max_iter=2000,
                                 early_stopping=True, validation_fraction=0.15, random_state=self.seed)
        raise ValueError(self.family)

    def fit(self, X: pd.DataFrame, y: pd.Series, sample_weight=None, X_val=None, y_val=None):
        feats = ["elo_diff"] if self.family == "elo" else self.features
        est = self._estimator()
        self.model_ = make_pipeline(FeaturePrep(feats, scale=self.family not in ("rf", "lgbm")), est)
        name = type(est).__name__.lower()
        kw = {}
        if sample_weight is not None and self.family != "nn":   # MLP has no sample weights
            kw[f"{name}__sample_weight"] = np.asarray(sample_weight)
        if self.family == "lgbm" and X_val is not None:
            prep = self.model_.steps[0][1].fit(X)
            from lightgbm import early_stopping
            kw.update({f"{name}__eval_set": [(prep.transform(X_val), y_val)],
                       f"{name}__callbacks": [early_stopping(100, verbose=False)]})
        self.model_.fit(X, y, **kw)
        return self

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        p = self.model_.predict_proba(X)
        order = [list(self.model_.classes_).index(c) for c in self.classes]
        return p[:, order]
