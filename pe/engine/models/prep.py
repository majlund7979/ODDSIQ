"""Feature preparation shared by the sklearn models: select columns, impute missing values with the
training median plus a 'was missing' flag (missing is information, never silently 0), standardise."""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin


class FeaturePrep(BaseEstimator, TransformerMixin):
    def __init__(self, features: list[str], scale: bool = True):
        self.features = features
        self.scale = scale

    def fit(self, X: pd.DataFrame, y=None):
        d = X[self.features].astype(float)
        self.median_ = d.median().fillna(0.0)
        self.flag_ = [c for c in self.features if d[c].isna().any()]
        filled = d.fillna(self.median_)
        self.mean_ = filled.mean()
        self.std_ = filled.std().replace(0, 1.0).fillna(1.0)
        return self

    def transform(self, X: pd.DataFrame) -> np.ndarray:
        d = X[self.features].astype(float)
        flags = d[self.flag_].isna().astype(float).to_numpy() if self.flag_ else np.empty((len(d), 0))
        filled = d.fillna(self.median_)
        if self.scale:
            filled = (filled - self.mean_) / self.std_
        return np.hstack([filled.to_numpy(), flags])
