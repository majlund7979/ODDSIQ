"""One walk-forward fold of the 1X2 model comparison (spec points 19, 22, 24):

1. Fit every member on the training seasons.
2. Predict the validation season; fit ensemble weights and calibration there.
3. Predict the test season with members, ensemble and calibrated ensemble; score them.

Team-strength goal models (Poisson, Dixon-Coles) are refitted every `refit_days` using only
results available before each refit date, so they are point-in-time like the features.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from engine.models import calibration, ensemble, metrics
from engine.models.classifiers import CLASSES_1X2, OutcomeModel, outcome_1x2
from engine.models.goal_models import FeaturePoissonModel, TeamStrengthModel
from engine.models.scores import markets, score_matrix
from engine.models.walkforward import Fold, split

ML_FAMILIES = ("elo", "logreg", "rf", "lgbm", "nn")
# Small grids, from strong to weak regularisation.
GRIDS = {
    "logreg": [{"C": c} for c in (0.001, 0.003, 0.01, 0.03, 0.1)],
    "nn": [{"alpha": a, "hidden": (8,)} for a in (3.0, 10.0, 30.0)],
    "rf": [{"min_samples_leaf": n} for n in (20, 60)],
}


def team_strength_probs(matches: pd.DataFrame, rows: pd.DataFrame, dixon_coles: bool, refit_days: int = 7,
                        half_life_days: float = 180.0) -> tuple[np.ndarray, pd.DataFrame]:
    """1X2 probabilities and expected goals for `rows` (need cutoff, home_team, away_team).
    With a `group` column (e.g. country), each group gets its own team-strength fit."""
    if "group" in rows.columns and rows["group"].nunique() > 1:
        out = np.zeros((len(rows), 3))
        lams = []
        for g, idx in rows.groupby("group").indices.items():
            p, lam = team_strength_probs(matches[matches["group"] == g], rows.iloc[idx], dixon_coles, refit_days, half_life_days)
            out[idx] = p
            lams.append(lam)
        return out, pd.concat(lams).loc[rows.index]
    out = np.zeros((len(rows), 3))
    lam = []
    model, fitted_at = None, None
    order = np.argsort(rows["cutoff"].to_numpy())
    for k in order:
        r = rows.iloc[k]
        if model is None or (r["cutoff"] - fitted_at).days >= refit_days:
            fitted_at = r["cutoff"]
            model = TeamStrengthModel(dixon_coles=dixon_coles, half_life_days=half_life_days).fit(matches, fitted_at)
        lh, la, rho = model.expected_goals(r["home_team"], r["away_team"])
        mk = markets(score_matrix(lh, la, rho))
        out[k] = [mk["home"], mk["draw"], mk["away"]]
        lam.append((rows.index[k], lh, la, rho))
    return out, pd.DataFrame(lam, columns=["idx", "lam_home", "lam_away", "rho"]).set_index("idx").loc[rows.index]


def feature_poisson_probs(model: FeaturePoissonModel, X: pd.DataFrame) -> np.ndarray:
    lh, la = model.expected_goals(X)
    return np.array([[m["home"], m["draw"], m["away"]] for m in (markets(score_matrix(a, b)) for a, b in zip(lh, la))])


@dataclass
class FoldResult:
    fold: Fold
    weights: dict
    calibrator: str
    params: dict
    scores: pd.DataFrame          # model × metric on the test season
    test_probs: dict = field(default_factory=dict)
    val_probs: dict = field(default_factory=dict)
    val_ids: list = field(default_factory=list)
    test_ids: list = field(default_factory=list)
    lambdas_val: pd.DataFrame | None = None     # Dixon-Coles expected goals for the over/under model
    lambdas_test: pd.DataFrame | None = None


def run_fold(matches: pd.DataFrame, feats: pd.DataFrame, features: list[str], fold: Fold,
             families=ML_FAMILIES, seed: int = 0, time_decay_days: float | None = 730.0) -> FoldResult:
    """feats: build_features output for all finished matches (one row per match, with match_id, season,
    cutoff), joined with home_goals/away_goals. Test rows may be unplayed (live run): they get
    probabilities but no scores."""
    tr, va, te = split(feats, fold)
    y_tr, y_va = (outcome_1x2(d["home_goals"], d["away_goals"]) for d in (tr, va))
    labelled = te["home_goals"].notna().all() and len(te) > 0
    y_te = outcome_1x2(te["home_goals"], te["away_goals"]) if labelled else None
    w_tr = None
    if time_decay_days:
        age = (va["cutoff"].min() - tr["cutoff"]).dt.total_seconds() / 86400.0
        w_tr = np.power(0.5, age / time_decay_days).to_numpy()

    val, test, chosen = {}, {}, {}
    for fam in families:
        # Regularisation strength is chosen on the validation season, never on the test season.
        best = None
        for params in GRIDS.get(fam, [{}]):
            m = OutcomeModel(fam, features, params=params, seed=seed).fit(
                tr, y_tr, w_tr, X_val=va if fam == "lgbm" else None, y_val=y_va if fam == "lgbm" else None)
            pv = m.predict_proba(va)
            ll = metrics.log_loss(pv, y_va, CLASSES_1X2)
            if best is None or ll < best[0]:
                best = (ll, params, m, pv)
        _, chosen[fam], m, val[fam] = best
        test[fam] = m.predict_proba(te)
    fp = FeaturePoissonModel([f for f in features if not f.startswith("mkt_")]).fit(tr, tr["home_goals"], tr["away_goals"], w_tr)
    val["feature_poisson"], test["feature_poisson"] = feature_poisson_probs(fp, va), feature_poisson_probs(fp, te)
    lam = {}
    for name, dc in (("poisson", False), ("dixon_coles", True)):
        val[name], lam[(name, "val")] = team_strength_probs(matches, va, dc)
        test[name], lam[(name, "test")] = team_strength_probs(matches, te, dc)

    weights = ensemble.fit_weights(val, y_va, CLASSES_1X2)
    val_ens, test_ens = ensemble.combine(val, weights), ensemble.combine(test, weights)
    cal = calibration.choose(val_ens, y_va, CLASSES_1X2)
    val["ensemble_calibrated"] = cal.transform(val_ens)
    test["ensemble"] = test_ens
    test["ensemble_calibrated"] = cal.transform(test_ens)
    base = y_tr.value_counts(normalize=True).reindex(CLASSES_1X2).fillna(0).to_numpy()
    test["base_rate"] = np.tile(base, (len(te), 1))
    if {"mkt_home", "mkt_draw", "mkt_away"} <= set(te.columns) and te["mkt_home"].notna().all():
        test["market"] = te[["mkt_home", "mkt_draw", "mkt_away"]].to_numpy()

    rows = []
    for name, p in (test.items() if labelled else ()):
        rows.append({"model": name, "log_loss": metrics.log_loss(p, y_te, CLASSES_1X2),
                     "brier": metrics.brier(p, y_te, CLASSES_1X2), "rps": metrics.rps(p, y_te, CLASSES_1X2),
                     "ece_home": metrics.ece(p[:, 0], (y_te == "home").to_numpy().astype(float)),
                     "accuracy": float((np.array(CLASSES_1X2)[p.argmax(axis=1)] == y_te.to_numpy()).mean()),
                     "n": len(te)})
    lv, lt = lam[("dixon_coles", "val")].copy(), lam[("dixon_coles", "test")].copy()
    lv["match_id"], lt["match_id"] = va["match_id"].to_numpy(), te["match_id"].to_numpy()
    fpv, fpt = fp.expected_goals(va), fp.expected_goals(te)
    lv["fp_home"], lv["fp_away"], lt["fp_home"], lt["fp_away"] = fpv[0], fpv[1], fpt[0], fpt[1]
    scores = pd.DataFrame(rows).set_index("model").sort_values("log_loss") if rows else pd.DataFrame()
    return FoldResult(fold, weights, cal.method, chosen, scores, test,
                      val, list(va["match_id"]), list(te["match_id"]), lv, lt)
