"""Step 5 backtest on football-data.co.uk history.

    python3 scripts/run_backtest.py --data <dir with main/*.csv> --out <dir>

Builds point-in-time features per country (top two divisions together, so promoted and
relegated teams keep their ratings), runs the walk-forward model zoo with market blending,
simulates several betting strategies and writes CSV/JSON reports.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import warnings
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
warnings.filterwarnings("ignore")

from engine.backtest import betting, predictions, report  # noqa: E402
from engine.features.build import build_features  # noqa: E402
from engine.sources import af_export, football_data, gabora  # noqa: E402

GROUPS = {"ENG": ["E0", "E1"], "GER": ["D1", "D2"], "ESP": ["SP1", "SP2"], "ITA": ["I1", "I2"], "FRA": ["F1", "F2"],
          "NED": ["N1"], "POR": ["P1"], "BEL": ["B1"], "SCO": ["SC0"], "TUR": ["T1"], "GRE": ["G1"]}
META = {"match_id", "league", "season", "kickoff", "home_team", "away_team", "cutoff", "stage", "feature_set", "group"}

STRATEGIES = [
    betting.Strategy("blend_bet365_edge2", bookmaker="bet365", min_edge=0.02, min_ev=0.03),
    betting.Strategy("blend_bet365_edge4", bookmaker="bet365", min_edge=0.04, min_ev=0.05),
    betting.Strategy("blend_pinnacle_edge2", bookmaker="pinnacle", min_edge=0.02, min_ev=0.02),
    betting.Strategy("blend_maxodds_edge2", bookmaker="market_max", min_edge=0.02, min_ev=0.03),
    betting.Strategy("flat_bet365_edge2", bookmaker="bet365", min_edge=0.02, min_ev=0.03, flat_stake=1.0),
    betting.Strategy("1x2_only_bet365", markets=("1x2",), bookmaker="bet365", min_edge=0.02, min_ev=0.03),
    betting.Strategy("ou_only_bet365", markets=("ou",), bookmaker="bet365", min_edge=0.02, min_ev=0.03),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="football-data dir, or the xgabora Matches.csv with --source gabora")
    ap.add_argument("--source", default="football-data", choices=["football-data", "gabora"])
    ap.add_argument("--last-season", type=int, default=2025)
    ap.add_argument("--out", required=True)
    ap.add_argument("--groups", default=",".join(GROUPS))
    ap.add_argument("--first-season", type=int, default=2012)
    ap.add_argument("--af-export", help="dir of API-Football export CSVs (xG, shots inside the box)")
    ap.add_argument("--score-from", type=int, help="only seasons from this one are used for training and testing "
                    "(features still use all history)")
    ap.add_argument("--min-train", type=int, default=3)
    ap.add_argument("--no-xg", action="store_true", help="drop xG features (same folds, for comparison)")
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    if args.source == "gabora":
        frames = gabora.to_frames(pd.read_csv(args.data, low_memory=False), first_season=args.first_season)
        market_book = "bet365"
        strategies = [s for s in STRATEGIES if s.bookmaker in ("bet365", "market_max")]
    else:
        frames = football_data.to_frames(football_data.load(Path(args.data), seasons=range(args.first_season, 2027)))
        frames["matches"]["group"] = frames["matches"]["league"].map({d: g for g, ds in GROUPS.items() for d in ds})
        market_book = "pinnacle"
        strategies = STRATEGIES
    if args.af_export:
        frames, paired = af_export.attach(frames, af_export.load(Path(args.af_export)))
        print(f"API-Football export: {len(paired)} matches paired, "
              f"{frames['team_stats']['xg'].notna().sum() // 2} with xG")
    m = frames["matches"]
    m = m[m["season"] <= args.last_season].reset_index(drop=True)
    frames["matches"] = m
    # Only finished seasons are scored; the running season is still loaded for history.
    print(f"loaded {len(m)} matches, {m['league'].nunique()} leagues, seasons {m['season'].min()}-{m['season'].max()}")
    feats = []
    for g in args.groups.split(","):
        t = time.time()
        gm = m[m["league"].isin(GROUPS[g])]
        if gm.empty:
            continue
        ts = frames["team_stats"][frames["team_stats"]["match_id"].isin(gm["match_id"])]
        # One batch per season, so league home advantage is estimated as of that season's start.
        for season, targets in gm.groupby("season"):
            f = build_features(gm, targets, "early", team_stats=ts)
            f["group"] = g
            feats.append(f)
        print(f"features {g}: {len(f)} matches in {time.time() - t:.0f}s")
    feats = pd.concat(feats, ignore_index=True)
    # Market features are excluded from the model: the market enters only through the blend,
    # so p_model is the model's own view.
    features = [c for c in feats.columns if c not in META and not c.startswith(("mkt_", "ou25_", "sharp_"))
                and feats[c].dtype != object]
    if args.no_xg:
        features = [c for c in features if "xg" not in c]
    if args.score_from:
        feats = feats[feats["season"] >= args.score_from].reset_index(drop=True)
    print(f"{len(features)} features")
    preds, folds = predictions.walk_forward(frames, feats, features, market_book=market_book, min_train=args.min_train)
    preds.to_csv(out / "predictions.csv.gz", index=False)
    prob = report.probability_report(preds, m)
    prob.to_csv(out / "probability_report.csv", index=False)
    print(prob.groupby(["market", "source"])[["log_loss", "ece"]].mean())
    summary = {"folds": [{"test": f["fold"].test, "blend_1x2": f["blend_1x2"], "blend_ou25": f["blend_ou25"],
                          "calibrator": f["calibrator"], "weights": f["weights"],
                          "scores": f["scores"].round(4).reset_index().to_dict("records")} for f in folds],
               "strategies": {}}
    for s in strategies:
        c = betting.candidates(preds, frames["odds"], m, s)
        b = betting.simulate(c, s)
        b.to_csv(out / f"bets_{s.name}.csv.gz", index=False)
        summary["strategies"][s.name] = report.bet_summary(b)
        if len(b):
            summary["strategies"][s.name]["by_league"] = report.by(b, "league").round(4).reset_index().to_dict("records")
            summary["strategies"][s.name]["by_season"] = report.by(b, "season").round(4).reset_index().to_dict("records")
            summary["strategies"][s.name]["by_market"] = report.by(b, "market").round(4).reset_index().to_dict("records")
            b["odds_band"] = pd.cut(b["odds"], [1, 1.5, 2, 2.5, 3.5, 6])
            summary["strategies"][s.name]["by_odds"] = report.by(b, "odds_band").round(4).reset_index().astype(str).to_dict("records")
        print(s.name, {k: v for k, v in summary["strategies"][s.name].items() if not k.startswith("by_")})
    (out / "summary.json").write_text(json.dumps(summary, indent=1, default=str))


if __name__ == "__main__":
    main()
