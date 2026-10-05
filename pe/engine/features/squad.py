"""Squad strength and missing players. A player's importance is learned from data:
his share of the team's minutes and his contribution while playing, both
time-decayed and read as of the cutoff. Missing importance (injuries before the
lineup; the actual XI after it) becomes a feature, and the *effect* of that
feature on goals is estimated by the models in step 4, never hard-coded.
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def player_importance(player_stats: pd.DataFrame, cutoff: pd.Timestamp, team, half_life_days: float = 180.0,
                      min_team_minutes: float = 450.0) -> pd.DataFrame:
    """Per player of `team`: decayed minute share (0..1 of a full XI-match) and attacking/defensive shares.
    player_stats: match_id, team, player, minutes, rating, goals, assists, shots, key_passes,
    tackles, interceptions, position, available_at, kickoff."""
    d = player_stats[(player_stats["team"] == team) & (player_stats["available_at"] < cutoff)]
    if d.empty:
        return pd.DataFrame(columns=["minute_share", "attack_share", "defence_share", "rating", "position"])
    age = (cutoff - d["kickoff"]).dt.total_seconds() / 86400.0
    w = np.power(0.5, age / half_life_days)
    team_minutes = (w * 90).groupby(d["match_id"]).first().sum()  # decayed team-match count × 90
    if team_minutes < min_team_minutes:
        return pd.DataFrame(columns=["minute_share", "attack_share", "defence_share", "rating", "position"])
    att = d[["goals", "assists", "shots", "key_passes"]].fillna(0) @ np.array([1.0, 0.7, 0.1, 0.15])
    dfn = d[["tackles", "interceptions"]].fillna(0).sum(axis=1)
    g = pd.DataFrame({"player": d["player"], "wm": w * d["minutes"], "watt": w * att, "wdef": w * dfn,
                      "wr": w * d["minutes"] * d["rating"].astype(float).fillna(6.5), "position": d["position"]})
    agg = g.groupby("player").agg(wm=("wm", "sum"), watt=("watt", "sum"), wdef=("wdef", "sum"), wr=("wr", "sum"),
                                  position=("position", lambda s: s.mode().iat[0] if len(s.mode()) else None))
    out = pd.DataFrame(index=agg.index)
    out["minute_share"] = agg["wm"] / team_minutes
    out["attack_share"] = agg["watt"] / max(agg["watt"].sum(), 1e-9)
    out["defence_share"] = agg["wdef"] / max(agg["wdef"].sum(), 1e-9)
    out["rating"] = agg["wr"] / agg["wm"].replace(0, np.nan)
    out["position"] = agg["position"]
    return out


def missing_player_features(targets: pd.DataFrame, player_stats: pd.DataFrame, injuries: pd.DataFrame,
                            lineups: pd.DataFrame | None = None, doubtful_weight: float = 0.5) -> pd.DataFrame:
    """Per side: importance missing.
    Before lineups: players reported out/doubtful (available_at < cutoff), weighted by importance.
    After lineups (if the lineup is known at the cutoff): importance of regulars not in the starting XI,
    and the minute-weighted rating of the XI vs the usual XI.
    injuries: match_id, team, player, status ('out'|'doubtful'), available_at.
    lineups:  match_id, team, player, starter (bool), available_at."""
    rows = []
    for t in targets.itertuples(index=False):
        rec = {}
        for side, team in (("home", t.home_team), ("away", t.away_team)):
            imp = player_importance(player_stats, t.cutoff, team)
            if imp.empty:
                rec.update({f"{side}_missing_minutes": np.nan, f"{side}_missing_attack": np.nan,
                            f"{side}_missing_defence": np.nan, f"{side}_missing_gk": np.nan})
                continue
            inj = injuries[(injuries["match_id"] == t.match_id) & (injuries["team"] == team) &
                           (injuries["available_at"] < t.cutoff)].drop_duplicates("player", keep="last")
            weight = pd.Series(np.where(inj["status"] == "out", 1.0, doubtful_weight), index=inj["player"])
            xi = None
            if lineups is not None:
                lu = lineups[(lineups["match_id"] == t.match_id) & (lineups["team"] == team) &
                             (lineups["available_at"] < t.cutoff) & lineups["starter"]]
                if len(lu):
                    xi = set(lu["player"])
            if xi is not None:
                # Lineup known: missing = regulars not starting (certain), regardless of injury reports.
                weight = pd.Series(1.0, index=[p for p in imp.index if p not in xi])
                in_xi = imp.loc[[p for p in imp.index if p in xi]]
                usual = imp.nlargest(11, "minute_share")
                rec[f"{side}_xi_rating_vs_usual"] = float(in_xi["rating"].mean() - usual["rating"].mean())
                rec[f"{side}_lineup_known"] = True
            else:
                rec[f"{side}_lineup_known"] = False
            w = weight.reindex(imp.index).fillna(0.0)
            rec[f"{side}_missing_minutes"] = float((w * imp["minute_share"]).sum())
            rec[f"{side}_missing_attack"] = float((w * imp["attack_share"]).sum())
            rec[f"{side}_missing_defence"] = float((w * imp["defence_share"]).sum())
            gk = imp["position"] == "G"
            rec[f"{side}_missing_gk"] = float((w[gk] * imp.loc[gk, "minute_share"]).sum())
        rows.append(rec)
    return pd.DataFrame(rows, index=targets.index)
