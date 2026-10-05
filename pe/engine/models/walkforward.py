"""Walk-forward folds by season: train on seasons before `validate`, calibrate and weight on
`validate`, score on `test`, then move one season forward (spec point 24)."""
from __future__ import annotations

from dataclasses import dataclass

import pandas as pd


@dataclass(frozen=True)
class Fold:
    train: tuple
    validate: object
    test: object


def season_folds(seasons, min_train: int = 2, max_train: int | None = None) -> list[Fold]:
    """Expanding window (max_train=None) or rolling window of at most `max_train` seasons, as in the
    spec's example (2019-2022 train, 2023 validate, 2024 test, then everything moves one season)."""
    s = sorted(set(seasons))
    return [Fold(tuple(s[max(0, k - max_train) if max_train else 0:k]), s[k], s[k + 1]) for k in range(min_train, len(s) - 1)]


def split(df: pd.DataFrame, fold: Fold, col: str = "season"):
    return df[df[col].isin(fold.train)], df[df[col] == fold.validate], df[df[col] == fold.test]
