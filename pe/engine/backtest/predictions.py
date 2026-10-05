"""Walk-forward predictions for the test seasons, as if made on the day.

For every fold (train → validate → test) the model zoo from step 4 is fitted on the
training seasons only. On the validation season we fit (a) ensemble weights and
calibration (inside run_fold) and (b) the market blend weight w:

    p_final ∝ p_model^w · p_market^(1-w)          (logarithmic pooling, per outcome)

w = 0 means "just copy the market", w = 1 means "ignore the market". If the model has no
information beyond the market, the fit drives w towards 0 and no bets will pass the filters,
which is the honest outcome. The market probability is the de-vigged pre-match Pinnacle price
(available at the prediction cutoff), never the closing price.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.optimize import minimize_scalar

from engine.features.market import devig_power
from engine.models.classifiers import CLASSES_1X2, outcome_1x2
from engine.models.metrics import log_loss
from engine.models.pipeline import run_fold
from engine.models.scores import markets, score_matrix
from engine.models.walkforward import season_folds

OU_CLASSES = ["over", "under"]


def market_fair(odds: pd.DataFrame, ids, market: str, selections, line=None, book: str = "pinnacle",
                kind: str = "pre") -> pd.DataFrame:
    o = odds[(odds["market"] == market) & (odds["bookmaker"] == book) & (odds["kind"] == kind)]
    if line is not None:
        o = o[o["line"] == line]
    wide = o.pivot_table(index="match_id", columns="selection", values="odds", aggfunc="last").reindex(ids)
    wide = wide.reindex(columns=list(selections))
    fair = np.full(wide.shape, np.nan)
    ok = wide.notna().all(axis=1).to_numpy()
    if ok.any():
        fair[ok] = np.apply_along_axis(devig_power, 1, wide.to_numpy()[ok])
    return pd.DataFrame(fair, index=wide.index, columns=list(selections))


def log_pool(p_model: np.ndarray, p_market: np.ndarray, w: float) -> np.ndarray:
    lp = w * np.log(np.clip(p_model, 1e-9, 1)) + (1 - w) * np.log(np.clip(p_market, 1e-9, 1))
    q = np.exp(lp - lp.max(axis=1, keepdims=True))
    return q / q.sum(axis=1, keepdims=True)


def fit_blend(p_model: np.ndarray, p_market: np.ndarray, y, classes) -> float:
    ok = ~np.isnan(p_market).any(axis=1)
    if ok.sum() < 50:
        return 1.0
    y = np.asarray(y)[ok]
    res = minimize_scalar(lambda w: log_loss(log_pool(p_model[ok], p_market[ok], w), y, classes), bounds=(0.0, 1.0), method="bounded")
    return float(res.x)


def ou_probs(lam: pd.DataFrame, line: float = 2.5, source: str = "dc") -> np.ndarray:
    cols = ("lam_home", "lam_away", "rho") if source == "dc" else ("fp_home", "fp_away", None)
    out = []
    for r in lam.itertuples(index=False):
        rho = getattr(r, cols[2]) if cols[2] else 0.0
        m = markets(score_matrix(getattr(r, cols[0]), getattr(r, cols[1]), rho))
        out.append([m[f"over_{line}"], m[f"under_{line}"]])
    return np.array(out)


def walk_forward(frames: dict, feats: pd.DataFrame, features: list[str], families=("elo", "logreg", "rf", "lgbm"),
                 min_train: int = 3, max_train: int | None = 4, market_book: str = "pinnacle", log=print) -> tuple[pd.DataFrame, list]:
    """One row per test match × market × selection with model, market and blended probabilities."""
    matches, odds = frames["matches"], frames["odds"]
    data = feats.merge(matches[["match_id", "home_goals", "away_goals"]], on="match_id")
    rows, folds = [], []
    for fold in season_folds(data["season"], min_train=min_train, max_train=max_train):
        r = run_fold(matches, data, features, fold, families=families)
        y_val = outcome_1x2(*[data.set_index("match_id").loc[r.val_ids, c] for c in ("home_goals", "away_goals")])
        # 1X2: calibrated ensemble blended with the Pinnacle pre-match price.
        mv = market_fair(odds, r.val_ids, "1x2", CLASSES_1X2, book=market_book).to_numpy()
        mt = market_fair(odds, r.test_ids, "1x2", CLASSES_1X2, book=market_book).to_numpy()
        w1 = fit_blend(r.val_probs["ensemble_calibrated"], mv, y_val, CLASSES_1X2)
        pt = r.test_probs["ensemble_calibrated"]
        bt = np.where(np.isnan(mt).any(axis=1, keepdims=True), pt, log_pool(pt, np.nan_to_num(mt, nan=1 / 3), w1))
        # Over/under 2.5: average of Dixon-Coles and feature-Poisson goal models, blended the same way.
        val_goals = data.set_index("match_id").loc[r.val_ids]
        y_ou_val = np.where(val_goals["home_goals"] + val_goals["away_goals"] > 2.5, "over", "under")
        pov = (ou_probs(r.lambdas_val, source="dc") + ou_probs(r.lambdas_val, source="fp")) / 2
        pot = (ou_probs(r.lambdas_test, source="dc") + ou_probs(r.lambdas_test, source="fp")) / 2
        mov = market_fair(odds, r.val_ids, "ou", OU_CLASSES, line=2.5, book=market_book).to_numpy()
        mot = market_fair(odds, r.test_ids, "ou", OU_CLASSES, line=2.5, book=market_book).to_numpy()
        w2 = fit_blend(pov, mov, y_ou_val, OU_CLASSES)
        bot = np.where(np.isnan(mot).any(axis=1, keepdims=True), pot, log_pool(pot, np.nan_to_num(mot, nan=0.5), w2))
        members = {k: v for k, v in r.test_probs.items() if k not in ("base_rate",)}
        spread = np.stack([members[k] for k in ("elo", "logreg", "rf", "lgbm", "dixon_coles", "feature_poisson") if k in members]).std(axis=0)
        folds.append({"fold": fold, "weights": r.weights, "calibrator": r.calibrator, "params": r.params,
                      "blend_1x2": w1, "blend_ou25": w2, "scores": r.scores})
        log(f"fold test={fold.test}: blend 1x2 w={w1:.2f}, ou2.5 w={w2:.2f}, calibrator={r.calibrator}")
        for k, mid in enumerate(r.test_ids):
            for j, sel in enumerate(CLASSES_1X2):
                rows.append((mid, fold.test, "1x2", None, sel, pt[k, j], mt[k, j], bt[k, j], spread[k, j], w1))
            for j, sel in enumerate(OU_CLASSES):
                rows.append((mid, fold.test, "ou", 2.5, sel, pot[k, j], mot[k, j], bot[k, j], np.nan, w2))
    preds = pd.DataFrame(rows, columns=["match_id", "season", "market", "line", "selection", "p_model", "p_market",
                                        "p_final", "model_spread", "blend_w"])
    return preds, folds
