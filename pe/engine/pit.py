"""Point-in-time helpers: every feature reads only rows known before its cutoff.

Rows carry `available_at` (when the engine could first have known them).
Targets carry `cutoff` (the moment the prediction is made). `asof_join`
attaches, for each target, the latest row of the same key whose
available_at is strictly before the cutoff.
"""
from __future__ import annotations

from datetime import timedelta

import pandas as pd

# Stages of a pre-match prediction and how long before kickoff each is made.
STAGE_OFFSETS = {
    "early": timedelta(hours=24),
    "pre_lineup": timedelta(hours=2),
    "post_lineup": timedelta(minutes=15),
}

# Conservative availability estimates for historical backfill, relative to kickoff.
BACKFILL_AVAILABLE_AFTER_KICKOFF = {
    "result": timedelta(hours=3),
    "team_stats": timedelta(hours=3),
    "player_stats": timedelta(hours=6),
    "lineup": timedelta(minutes=-40),
}


def cutoffs(matches: pd.DataFrame, stage: str) -> pd.Series:
    """Prediction moment for each match at the given stage."""
    return matches["kickoff"] - STAGE_OFFSETS[stage]


def asof_join(targets: pd.DataFrame, rows: pd.DataFrame, by: str, value_cols: list[str],
              target_by: str | None = None, suffix: str = "") -> pd.DataFrame:
    """For each target, the values of the last row (by available_at) with the same key
    and available_at < target cutoff. Targets need `cutoff`; rows need `available_at`."""
    target_by = target_by or by
    left = targets[[target_by, "cutoff"]].copy()
    left["_order"] = range(len(left))
    left = left.rename(columns={target_by: "_key"}).sort_values("cutoff")
    right = rows[[by, "available_at", *value_cols]].rename(columns={by: "_key"}).sort_values("available_at")
    merged = pd.merge_asof(left, right, left_on="cutoff", right_on="available_at", by="_key",
                           allow_exact_matches=False, direction="backward")
    merged = merged.sort_values("_order")
    out = merged[value_cols].reset_index(drop=True)
    out.index = targets.index
    return out.add_suffix(suffix) if suffix else out


def assert_no_future_rows(rows: pd.DataFrame, cutoff: pd.Timestamp, what: str) -> None:
    """Guard for code paths that filter by hand."""
    bad = rows[rows["available_at"] >= cutoff]
    if len(bad):
        raise AssertionError(f"{what}: {len(bad)} rows known only after the cutoff {cutoff}")
