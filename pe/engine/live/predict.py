"""Daily shadow run, without the database: history + the site's matches → probabilities and value table.

1. History (football-data via the xgabora mirror) plus newer results from the site, with team names
   mapped to the history's spelling (names.py). Unmapped matches are dropped and reported.
2. Features for the last seasons (stage 'early', as in the backtest) and for the upcoming matches
   with cutoff = now, so a live feature only reads what is known at the moment of the run.
3. The step-5 fold: train on the seasons before last, fit ensemble weights, calibration and the
   market blend weight on the last finished season, then predict the upcoming matches.
4. The market's fair probability for an upcoming match is the median de-vigged price across the
   site's bookmakers (value/quotes.py); the blended probability pools model and market with the
   fitted weight, exactly as in the backtest.
5. The value engine (step 6) evaluates every selection and records why it is rejected; approved
   bets get quarter-Kelly stakes within the step-7 limits.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from engine.backtest.predictions import OU_CLASSES, fit_blend, log_pool, market_fair, ou_probs
from engine.features.build import FEATURE_SET_VERSION, build_features
from engine.live import names
from engine.models.classifiers import CLASSES_1X2, outcome_1x2
from engine.models.metrics import log_loss
from engine.models.pipeline import run_fold
from engine.models.walkforward import Fold
from engine.risk import kelly, limits
from engine.sources.gabora import GROUPS
from engine.value import engine as value
from engine.value import quotes as q
from engine.value import uncertainty as unc

META = {"match_id", "league", "season", "kickoff", "home_team", "away_team", "cutoff", "stage", "feature_set", "group"}
FAMILIES = ("elo", "logreg", "rf", "lgbm")
# Step 6 fitted tau = 0 in every backtest season (no edge survives); scale is irrelevant then.
UNCERTAINTY = unc.Uncertainty(tau=0.0, scale=0.5)


def season_of(ts: pd.Series) -> pd.Series:
    return pd.Series(np.where(ts.dt.month >= 7, ts.dt.year, ts.dt.year - 1), index=ts.index)


@dataclass
class Run:
    now: pd.Timestamp
    matches: pd.DataFrame                  # upcoming matches that were predicted (engine ids)
    features: pd.DataFrame                 # their feature rows
    feature_names: list
    preds: pd.DataFrame                    # match_id, market, line, selection, p_model, p_market, p, model_spread
    value: pd.DataFrame                    # value engine output + stake_share / capped_by
    odds: pd.DataFrame                     # the site prices used (engine match ids)
    model: dict                            # weights, calibrator, blend weights, validation scores
    report: dict = field(default_factory=dict)


def _recent_teams(m: pd.DataFrame, season: int) -> dict[str, list]:
    r = m[m["season"] >= season - 1]
    return {g: sorted(set(d["home_team"]) | set(d["away_team"])) for g, d in r.groupby("group")}


def _map(df: pd.DataFrame, candidates: dict, aliases: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Adds home_team / away_team (history spelling); returns (mapped rows, name report)."""
    df = df.assign(group=df["division"].map(GROUPS))
    out, rep = [], []
    for g, d in df.groupby("group"):
        mp = names.site_to_history(pd.concat([d["home"], d["away"]]), candidates.get(g, []), aliases)
        mp["group"] = g
        rep.append(mp)
        lut = mp.set_index("site")["team"]
        out.append(d.assign(home_team=d["home"].map(lut), away_team=d["away"].map(lut)))
    if not out:
        return df.assign(home_team=None, away_team=None).iloc[:0], pd.DataFrame(columns=["site", "team", "score", "how", "group"])
    return pd.concat(out).dropna(subset=["home_team", "away_team"]), pd.concat(rep, ignore_index=True)


def assemble(history: dict, site_events: pd.DataFrame, site_results: pd.DataFrame, now: pd.Timestamp,
             aliases: pd.DataFrame | None = None, horizon_days: int = 7) -> tuple[dict, pd.DataFrame, dict]:
    """History frames extended with the site's newer results, and the upcoming matches to predict."""
    aliases = names.load_aliases() if aliases is None else aliases
    frames = names.canonical_history(history, aliases)
    m = frames["matches"]
    current = int(season_of(pd.Series([now])).iloc[0])
    cand = _recent_teams(m, current)
    report = {}

    # Newer results: the site's finished events and statistics fixtures, kept only when the history lacks them.
    res = pd.concat([site_results[["division", "kickoff", "home", "away", "home_goals", "away_goals"]],
                     site_events.loc[site_events["status"] == "finished",
                                     ["division", "kickoff", "home", "away", "home_goals", "away_goals"]]],
                    ignore_index=True).dropna(subset=["home_goals", "away_goals"])
    res = res[res["kickoff"] < now]
    res, rep_r = _map(res, cand, aliases)
    if len(res):
        res["day"] = res["kickoff"].dt.floor("D")
        known = set(zip(m["league"], m["kickoff"].dt.floor("D"), m["home_team"]))
        known |= {(lg, d + pd.Timedelta(days=s), h) for lg, d, h in known for s in (-1, 1)}
        res = res[[(lg, d, h) not in known for lg, d, h in zip(res["division"], res["day"], res["home_team"])]]
        res = res.drop_duplicates(["division", "day", "home_team"])
        add = pd.DataFrame({
            "match_id": "site-" + res["division"] + "-" + res["kickoff"].dt.strftime("%Y%m%d%H%M") + "-" +
                        res["home_team"].str.replace(" ", "") + "-" + res["away_team"].str.replace(" ", ""),
            "league": res["division"], "group": res["division"].map(GROUPS), "season": season_of(res["kickoff"]),
            "kickoff": res["kickoff"], "home_team": res["home_team"], "away_team": res["away_team"],
            "home_goals": res["home_goals"].astype(float), "away_goals": res["away_goals"].astype(float),
            "result_available_at": res["kickoff"] + pd.Timedelta(hours=3), "went_to_extra": False})
        m = pd.concat([m, add], ignore_index=True)
    report["results_added"] = int(len(res))

    # Upcoming: scheduled, after now (with a margin so the cutoff stays before kickoff), within the horizon.
    up = site_events[(site_events["status"] == "scheduled") & (site_events["kickoff"] > now + pd.Timedelta(minutes=10))
                     & (site_events["kickoff"] <= now + pd.Timedelta(days=horizon_days))]
    up, rep_u = _map(up, cand, aliases)
    # The same match from two feeds: keep the API-Football one (it has a fixture id).
    up = up.assign(_apf=up["af_fixture_id"].notna()).sort_values("_apf", ascending=False)
    up = up.assign(day=up["kickoff"].dt.floor("D")).drop_duplicates(["division", "day", "home_team", "away_team"])
    upcoming = pd.DataFrame({
        "match_id": "site-" + up["event_id"].astype(str), "event_id": up["event_id"], "af_fixture_id": up["af_fixture_id"],
        "league": up["division"], "group": up["division"].map(GROUPS), "season": season_of(up["kickoff"]),
        "kickoff": up["kickoff"], "home_team": up["home_team"], "away_team": up["away_team"],
        "site_home": up["home"], "site_away": up["away"], "home_goals": np.nan, "away_goals": np.nan,
        "result_available_at": up["kickoff"] + pd.Timedelta(hours=3), "went_to_extra": False}).reset_index(drop=True)
    names_rep = pd.concat([rep_r, rep_u], ignore_index=True).drop_duplicates(["group", "site"])
    report["upcoming_events"] = int(len(site_events[site_events["status"] == "scheduled"]))
    report["upcoming_mapped"] = int(len(upcoming))
    report["unmapped_names"] = sorted(names_rep.loc[names_rep["how"] == "none", "site"].tolist())
    report["fuzzy_names"] = names_rep.loc[names_rep["how"] == "fuzzy", ["site", "team"]].round(2).values.tolist()
    frames = {**frames, "matches": pd.concat([m, upcoming[m.columns.intersection(upcoming.columns)]], ignore_index=True)}
    return frames, upcoming, report


def _features(frames: dict, upcoming: pd.DataFrame, now: pd.Timestamp, seasons: list[int]) -> pd.DataFrame:
    m, ts = frames["matches"], frames["team_stats"]
    out = []
    for g, gm in m.groupby("group"):
        gts = ts[ts["match_id"].isin(gm["match_id"])]
        done = gm.dropna(subset=["home_goals"])
        for season, targets in done[done["season"].isin(seasons)].groupby("season"):
            out.append(build_features(gm, targets, "early", team_stats=gts).assign(group=g))
        up = gm[gm["match_id"].isin(upcoming["match_id"])]
        if len(up):
            out.append(build_features(gm, up, "early", team_stats=gts, cutoff=now).assign(group=g))
    return pd.concat(out, ignore_index=True)


def _stage(kickoff: pd.Series, now: pd.Timestamp) -> pd.Series:
    return pd.Series(np.where(kickoff - now >= pd.Timedelta(hours=2), "early", "pre_lineup"), index=kickoff.index)


def predict(frames: dict, upcoming: pd.DataFrame, site_odds: pd.DataFrame, now: pd.Timestamp,
            train_seasons: int = 3, families=FAMILIES, log=print) -> Run:
    """site_odds: site.odds() with event_id; returns the full run (nothing written)."""
    current = int(season_of(pd.Series([now])).iloc[0])
    validate = current - 1
    train = tuple(range(validate - train_seasons, validate))
    feats = _features(frames, upcoming, now, [*train, validate])
    names_ = [c for c in feats.columns if c not in META and not c.startswith(("mkt_", "ou25_", "sharp_"))
              and feats[c].dtype != object and "xg" not in c]
    m = frames["matches"]
    data = feats.merge(m[["match_id", "home_goals", "away_goals"]], on="match_id")
    is_up = data["match_id"].isin(upcoming["match_id"])
    data.loc[is_up, "season"] = current
    log(f"features: {len(names_)} columns, {(~is_up).sum()} history rows, {is_up.sum()} upcoming")
    fold = Fold(train, validate, current)
    r = run_fold(m, data, names_, fold, families=families)

    vd = data.set_index("match_id").loc[r.val_ids]
    y_val = outcome_1x2(vd["home_goals"], vd["away_goals"])
    mv = market_fair(frames["odds"], r.val_ids, "1x2", CLASSES_1X2, book="bet365").to_numpy()
    w1 = fit_blend(r.val_probs["ensemble_calibrated"], mv, y_val, CLASSES_1X2)
    y_ou = np.where(vd["home_goals"] + vd["away_goals"] > 2.5, "over", "under")
    pov = (ou_probs(r.lambdas_val, source="dc") + ou_probs(r.lambdas_val, source="fp")) / 2
    mov = market_fair(frames["odds"], r.val_ids, "ou", OU_CLASSES, line=2.5, book="bet365").to_numpy()
    w2 = fit_blend(pov, mov, y_ou, OU_CLASSES)
    ok = ~np.isnan(mv).any(axis=1)
    val_scores = {"matches": len(r.val_ids),
                  "log_loss_model_1x2": log_loss(r.val_probs["ensemble_calibrated"][ok], y_val[ok], CLASSES_1X2),
                  "log_loss_market_1x2": log_loss(mv[ok], y_val[ok], CLASSES_1X2)}
    log(f"blend weights on {validate}: 1x2 w={w1:.2f}, ou2.5 w={w2:.2f}; calibrator={r.calibrator}")

    # The site's prices, keyed by engine match id; the fair price per selection from quotes().
    up = upcoming.set_index("match_id")
    odds = site_odds.merge(upcoming[["event_id", "match_id"]], on="event_id")
    qs = []
    for mid in r.test_ids:
        for mk, line in (("1x2", None), ("ou", 2.5)):
            qq = q.quotes(odds, mid, mk, now + pd.Timedelta(seconds=1), line=line)
            if len(qq):
                qs.append(qq)
    quotes = pd.concat(qs, ignore_index=True) if qs else pd.DataFrame(columns=["match_id", "market", "selection", "p_fair"])
    fair = quotes.set_index(["match_id", "market", "selection"])["p_fair"] if len(quotes) else pd.Series(dtype=float)

    pt = r.test_probs["ensemble_calibrated"]
    pot = (ou_probs(r.lambdas_test, source="dc") + ou_probs(r.lambdas_test, source="fp")) / 2
    members = [r.test_probs[k] for k in ("elo", "logreg", "rf", "lgbm", "dixon_coles", "feature_poisson") if k in r.test_probs]
    spread = np.stack(members).std(axis=0)
    rows = []
    for k, mid in enumerate(r.test_ids):
        for mk, classes, p_mod, w, line in (("1x2", CLASSES_1X2, pt[k], w1, None), ("ou", OU_CLASSES, pot[k], w2, 2.5)):
            pm = np.array([fair.get((mid, mk, s), np.nan) for s in classes])
            p = log_pool(p_mod[None, :], pm[None, :], w)[0] if not np.isnan(pm).any() else p_mod
            for j, s in enumerate(classes):
                rows.append({"match_id": mid, "league": up.loc[mid, "league"], "market": mk, "line": line, "selection": s,
                             "p_model": float(p_mod[j]), "p_market": float(pm[j]), "p": float(p[j]),
                             "model_spread": float(spread[k, j]) if mk == "1x2" else np.nan, "blend_w": w})
    preds = pd.DataFrame(rows)

    v = value.evaluate(preds, quotes, history=None, u=UNCERTAINTY) if len(quotes) else pd.DataFrame()
    if len(v):
        v["kelly"] = [kelly.single(p, o) if bet else 0.0 for p, o, bet in zip(v["p_shrunk"], v["odds"], v["is_bet"] & v["best_in_market"])]
        bets = v[v["kelly"] > 0]
        v["stake_share"], v["capped_by"] = 0.0, ""
        if len(bets):
            s = limits.apply(bets[["match_id", "league", "kelly"]])
            v.loc[s.index, "stake_share"] = s["stake"]
            v.loc[s.index, "capped_by"] = s["capped_by"]
    model = {"families": list(families), "train": list(train), "validate": validate, "weights": r.weights,
             "calibrator": r.calibrator, "params": r.params, "blend_1x2": w1, "blend_ou25": w2,
             "validation": val_scores, "uncertainty": {"tau": UNCERTAINTY.tau, "scale": UNCERTAINTY.scale},
             "feature_set": FEATURE_SET_VERSION}
    upf = feats[feats["match_id"].isin(upcoming["match_id"])]
    mt = upcoming[upcoming["match_id"].isin(r.test_ids)].copy()
    mt["stage"] = _stage(mt["kickoff"], now)
    return Run(now, mt, upf, names_, preds, v, odds, model)
