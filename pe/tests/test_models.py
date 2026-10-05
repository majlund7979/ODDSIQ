import warnings

import numpy as np
import pandas as pd
import pytest

from conftest import make_league
from engine.features.build import build_features
from engine.models import calibration, ensemble, metrics, simulate
from engine.models.classifiers import CLASSES_1X2
from engine.models.goal_models import TeamStrengthModel
from engine.models.pipeline import run_fold
from engine.models.scores import markets, score_matrix
from engine.models.walkforward import season_folds

warnings.filterwarnings("ignore")


def test_score_matrix_and_markets_are_consistent():
    m = score_matrix(1.6, 1.1, rho=-0.08)
    assert m.sum() == pytest.approx(1)
    k = markets(m)
    assert k["home"] + k["draw"] + k["away"] == pytest.approx(1)
    assert k["over_2.5"] + k["under_2.5"] == pytest.approx(1)
    assert k["ah_home_-0.5"] == pytest.approx(k["home"])
    assert k["ah_home_0.0"] == pytest.approx(k["home"]) and k["ah_home_0.0_push"] == pytest.approx(k["draw"])
    assert k["dc_1x"] == pytest.approx(1 - k["away"])
    assert k["exp_home_goals"] == pytest.approx(1.6, abs=0.05)
    # Quarter line -0.25: half the stake on 0 (draw refunds), half on -0.5 (draw loses).
    assert k["ah_home_-0.25_lose"] == pytest.approx(k["away"] + k["draw"] / 2)
    # Negative rho moves mass to 0-0 and 1-1 compared with plain Poisson.
    plain = score_matrix(1.6, 1.1)
    assert m[0, 0] > plain[0, 0] and m[1, 1] > plain[1, 1]


def test_monte_carlo_is_reproducible_and_matches_exact_sums():
    m = score_matrix(1.4, 1.2, rho=-0.05)
    seed = simulate.seed_for(123, "dc-test")
    h1, a1 = simulate.simulate_scores(m, 100_000, seed)
    h2, a2 = simulate.simulate_scores(m, 100_000, seed)
    assert (h1 == h2).all() and (a1 == a2).all()
    s, exact = simulate.summarise(h1, a1), markets(m)
    for key in ("home", "draw", "away", "over_2.5", "btts_yes"):
        p, se = s[key]
        assert abs(p - exact[key]) < 4 * se, key


def test_dixon_coles_recovers_true_strengths():
    d = make_league(seed=11, teams=12, seasons=(2023, 2024, 2025))
    m = d["matches"]
    fit = TeamStrengthModel(dixon_coles=True, half_life_days=10_000).fit(m, m["kickoff"].max() + pd.Timedelta(days=1))
    att = pd.Series(fit.params_["attack"])
    true = pd.Series(d["attack"]).reindex(att.index)
    assert att.corr(true) > 0.8
    # Home advantage matches the sample's own home/away goal ratio (the sample's ratio, not the generator's 0.25,
    # because one simulated league is a noisy draw).
    assert fit.params_["home"] == pytest.approx(np.log(m["home_goals"].mean() / m["away_goals"].mean()), abs=0.05)


def test_calibration_fixes_overconfidence_and_leaves_good_probs_alone():
    rng = np.random.default_rng(0)
    true = rng.dirichlet([4, 3, 3], size=4000)
    y = np.array([rng.choice(CLASSES_1X2, p=p) for p in true])
    over = true ** 2.5
    over = over / over.sum(axis=1, keepdims=True)
    cal = calibration.choose(over[:2000], y[:2000], CLASSES_1X2)
    assert cal.method != "none"
    assert metrics.log_loss(cal.transform(over[2000:]), y[2000:], CLASSES_1X2) < metrics.log_loss(over[2000:], y[2000:], CLASSES_1X2)
    assert calibration.choose(true[:2000], y[:2000], CLASSES_1X2).method == "none"


def test_ensemble_weights_favour_the_better_model():
    rng = np.random.default_rng(1)
    true = rng.dirichlet([4, 3, 3], size=3000)
    y = np.array([rng.choice(CLASSES_1X2, p=p) for p in true])
    noisy = rng.dirichlet([1, 1, 1], size=3000)
    w = ensemble.fit_weights({"good": true, "noise": noisy}, y, CLASSES_1X2)
    assert sum(w.values()) == pytest.approx(1)
    assert w["good"] > 0.85
    assert ensemble.agreement({"a": true, "b": true}, 0).max() == 0


def test_walk_forward_fold_beats_base_rate():
    d = make_league(seed=3, teams=12, seasons=(2021, 2022, 2023, 2024))
    m = d["matches"]
    f = build_features(m, m, "early", team_stats=d["team_stats"]).merge(m[["match_id", "home_goals", "away_goals"]], on="match_id")
    skip = {"match_id", "league", "season", "kickoff", "home_team", "away_team", "cutoff", "stage", "feature_set", "home_goals", "away_goals"}
    feats = [c for c in f.columns if c not in skip and f[c].dtype != object]
    fold = season_folds(f["season"])[0]
    assert fold.test == 2024 and 2024 not in fold.train
    r = run_fold(m, f, feats, fold, families=("elo", "logreg", "lgbm"))
    s = r.scores["log_loss"]
    assert s["dixon_coles"] < s["base_rate"]
    assert s["ensemble_calibrated"] < s["base_rate"]
    assert sum(r.weights.values()) == pytest.approx(1)
