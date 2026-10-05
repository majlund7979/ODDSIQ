"""Match context from the league table rebuilt from results known before the cutoff
(the provider's /standings is today's table and would leak). Pressure features are
point gaps to the zones divided by games left; derby and coach-change flags.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

# Zone sizes per league: places for title, Europe and relegation (configured, not learned).
DEFAULT_ZONES = {"title": 1, "europe": 4, "relegation": 3}


def table_asof(matches: pd.DataFrame, league: str, season, cutoff: pd.Timestamp) -> pd.DataFrame:
    """Points, goal difference, played and rank per team from results available before the cutoff."""
    m = matches[(matches["league"] == league) & (matches["season"] == season)]
    teams = pd.unique(pd.concat([m["home_team"], m["away_team"]]))
    done = m[(m["result_available_at"] < cutoff)].dropna(subset=["home_goals"])
    hp = np.select([done["home_goals"] > done["away_goals"], done["home_goals"] == done["away_goals"]], [3, 1], 0)
    ap = np.select([done["away_goals"] > done["home_goals"], done["home_goals"] == done["away_goals"]], [3, 1], 0)
    long = pd.concat([
        pd.DataFrame({"team": done["home_team"], "points": hp, "gf": done["home_goals"], "ga": done["away_goals"]}),
        pd.DataFrame({"team": done["away_team"], "points": ap, "gf": done["away_goals"], "ga": done["home_goals"]}),
    ])
    agg = long.groupby("team").agg(points=("points", "sum"), gf=("gf", "sum"), ga=("ga", "sum"), played=("points", "size"))
    t = agg.reindex(teams).fillna(0)
    t.index.name = "team"
    t["gd"] = t["gf"] - t["ga"]
    t = t.sort_values(["points", "gd", "gf"], ascending=False)
    t["rank"] = np.arange(1, len(t) + 1)
    # Games left = fixtures in this season not yet kicked off at the cutoff (fixture lists are public).
    left = m[m["kickoff"] >= cutoff]
    t["games_left"] = [int(((left["home_team"] == x) | (left["away_team"] == x)).sum()) for x in t.index]
    return t


def context_features(targets: pd.DataFrame, matches: pd.DataFrame, zones: dict[str, dict] | None = None,
                     derbies: set[frozenset] | None = None) -> pd.DataFrame:
    rows = []
    cache: dict = {}
    for t in targets.itertuples(index=False):
        key = (t.league, t.season, t.cutoff)
        if key not in cache:
            cache[key] = table_asof(matches, t.league, t.season, t.cutoff)
        tab = cache[key]
        z = (zones or {}).get(t.league, DEFAULT_ZONES)
        n = len(tab)
        rec = {}
        for side, team in (("home", t.home_team), ("away", t.away_team)):
            if team not in tab.index or n == 0:
                continue
            r = tab.loc[team]
            pts_at = lambda place: tab["points"].iloc[min(max(place, 1), n) - 1]
            left = max(int(r["games_left"]), 1)
            rec[f"{side}_rank"] = int(r["rank"])
            rec[f"{side}_played"] = int(r["played"])
            rec[f"{side}_ppg"] = r["points"] / r["played"] if r["played"] else np.nan
            rec[f"{side}_gap_title"] = (pts_at(z["title"]) - r["points"]) / left
            rec[f"{side}_gap_europe"] = (pts_at(z["europe"]) - r["points"]) / left
            # Positive = points above the first relegation place, per game left.
            rec[f"{side}_gap_relegation"] = (r["points"] - pts_at(n - z["relegation"] + 1)) / left
            rec[f"{side}_games_left"] = int(r["games_left"])
        rec["derby"] = bool(derbies and frozenset((t.home_team, t.away_team)) in derbies)
        rows.append(rec)
    return pd.DataFrame(rows, index=targets.index)


def coach_change_features(targets: pd.DataFrame, lineups: pd.DataFrame) -> pd.DataFrame:
    """Matches since the current coach first appeared on the team's lineup sheet, as of the cutoff.
    lineups: match_id, team, coach, kickoff, available_at."""
    rows = []
    by_team = {t: g.sort_values("kickoff") for t, g in lineups.groupby("team")}
    for t in targets.itertuples(index=False):
        rec = {}
        for side, team in (("home", t.home_team), ("away", t.away_team)):
            g = by_team.get(team)
            g = g[g["available_at"] < t.cutoff] if g is not None else None
            if g is None or g.empty:
                rec[f"{side}_coach_matches"] = np.nan
                continue
            coaches = g["coach"].tolist()
            run = 0
            for c in reversed(coaches):  # trailing matches with the current coach
                if c != coaches[-1]:
                    break
                run += 1
            rec[f"{side}_coach_matches"] = run
            rec[f"{side}_new_coach"] = run < len(coaches)
        rows.append(rec)
    return pd.DataFrame(rows, index=targets.index)
