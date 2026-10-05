"""Club-Football-Match-Data-2000-2025 (github.com/xgabora, built from football-data.co.uk)
→ the engine's frames. Used while football-data.co.uk itself cannot be fetched.

It has Bet365 pre-match odds and the maximum of ~17 bookmakers for 1X2 and O/U 2.5, but no
Pinnacle and no closing prices, so CLV cannot be measured from it. Pre-match odds are stamped
at kickoff - 30 h, as for football-data (see football_data.py)."""
from __future__ import annotations

import numpy as np
import pandas as pd

from engine.sources.football_data import PRE_ODDS_LEAD

GROUPS = {"E0": "ENG", "E1": "ENG", "D1": "GER", "D2": "GER", "SP1": "ESP", "SP2": "ESP", "I1": "ITA", "I2": "ITA",
          "F1": "FRA", "F2": "FRA", "N1": "NED", "P1": "POR", "B1": "BEL", "SC0": "SCO", "T1": "TUR", "G1": "GRE"}


def to_frames(raw: pd.DataFrame, divisions=tuple(GROUPS), first_season: int = 2012) -> dict[str, pd.DataFrame]:
    d = raw[raw["Division"].isin(divisions)].dropna(subset=["FTHome", "FTAway"]).copy()
    date = pd.to_datetime(d["MatchDate"])
    d["season"] = np.where(date.dt.month >= 7, date.dt.year, date.dt.year - 1)
    d = d[d["season"] >= first_season]
    time = d["MatchTime"].fillna("15:00").astype(str).str.slice(0, 5)
    ko = pd.to_datetime(d["MatchDate"].astype(str) + " " + time, errors="coerce")
    d["kickoff"] = ko.dt.tz_localize("Europe/London", ambiguous="NaT", nonexistent="shift_forward").dt.tz_convert("UTC")
    d = d.dropna(subset=["kickoff"])
    d["match_id"] = (d["Division"] + "-" + d["kickoff"].dt.strftime("%Y%m%d%H%M") + "-" +
                     d["HomeTeam"].str.replace(" ", "") + "-" + d["AwayTeam"].str.replace(" ", ""))
    d = d.drop_duplicates("match_id").reset_index(drop=True)
    matches = pd.DataFrame({
        "match_id": d["match_id"], "league": d["Division"], "group": d["Division"].map(GROUPS), "season": d["season"],
        "kickoff": d["kickoff"], "home_team": d["HomeTeam"], "away_team": d["AwayTeam"],
        "home_goals": d["FTHome"].astype(float), "away_goals": d["FTAway"].astype(float),
        "result_available_at": d["kickoff"] + pd.Timedelta(hours=3), "went_to_extra": False,
    })
    stat = {"shots": ("HomeShots", "AwayShots"), "shots_on_target": ("HomeTarget", "AwayTarget"),
            "corners": ("HomeCorners", "AwayCorners"), "fouls": ("HomeFouls", "AwayFouls"),
            "yellow_cards": ("HomeYellow", "AwayYellow"), "red_cards": ("HomeRed", "AwayRed")}
    home = pd.DataFrame({"match_id": d["match_id"], "team": d["HomeTeam"], **{k: d[h] for k, (h, a) in stat.items()}})
    away = pd.DataFrame({"match_id": d["match_id"], "team": d["AwayTeam"], **{k: d[a] for k, (h, a) in stat.items()}})
    cols = [("bet365", "1x2", None, "home", "OddHome"), ("bet365", "1x2", None, "draw", "OddDraw"),
            ("bet365", "1x2", None, "away", "OddAway"), ("bet365", "ou", 2.5, "over", "Over25"),
            ("bet365", "ou", 2.5, "under", "Under25"), ("market_max", "1x2", None, "home", "MaxHome"),
            ("market_max", "1x2", None, "draw", "MaxDraw"), ("market_max", "1x2", None, "away", "MaxAway"),
            ("market_max", "ou", 2.5, "over", "MaxOver25"), ("market_max", "ou", 2.5, "under", "MaxUnder25")]
    rows = []
    for book, mk, line, sel, col in cols:
        o = pd.to_numeric(d[col], errors="coerce")
        ok = o > 1.0
        rows.append(pd.DataFrame({"match_id": d.loc[ok, "match_id"], "bookmaker": book, "market": mk, "line": line,
                                  "selection": sel, "odds": o[ok], "kind": "pre",
                                  "available_at": d.loc[ok, "kickoff"] - PRE_ODDS_LEAD}))
    return {"matches": matches, "team_stats": pd.concat([home, away], ignore_index=True),
            "odds": pd.concat(rows, ignore_index=True)}
