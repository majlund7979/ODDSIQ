"""football-data.co.uk CSVs → the engine's frames (matches, team_stats, odds).

Odds timing (football-data's own notes): the pre-match columns (B365H, PSH, MaxH, AvgH,
B365>2.5, ...) are collected on Friday afternoon for weekend games and Tuesday for midweek
games, so roughly 1-3 days before kickoff. The closing columns (B365CH, PSCH, MaxCH, AvgCH,
PC>2.5, ...) are the last prices before kickoff. We therefore stamp pre-match odds at
kickoff - 30 h (visible to the 'early' stage at kickoff - 24 h) and closing odds at kickoff,
so they can only be used for CLV, never for a prediction.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

DIVISIONS = {
    "E0": "Premier League", "E1": "Championship", "D1": "Bundesliga", "D2": "2. Bundesliga",
    "SP1": "La Liga", "SP2": "LaLiga 2", "I1": "Serie A", "I2": "Serie B", "F1": "Ligue 1", "F2": "Ligue 2",
    "N1": "Eredivisie", "P1": "Primeira Liga", "B1": "Jupiler Pro League", "SC0": "Scottish Premiership",
    "T1": "Super Lig", "G1": "Greek Super League",
}
PRE_ODDS_LEAD = pd.Timedelta(hours=30)

# (market, line, selection, column) for pre-match and closing prices per bookmaker.
ODDS_COLUMNS = {
    "pinnacle": {"pre": [("1x2", None, "home", "PSH"), ("1x2", None, "draw", "PSD"), ("1x2", None, "away", "PSA"),
                         ("ou", 2.5, "over", "P>2.5"), ("ou", 2.5, "under", "P<2.5")],
                 "closing": [("1x2", None, "home", "PSCH"), ("1x2", None, "draw", "PSCD"), ("1x2", None, "away", "PSCA"),
                             ("ou", 2.5, "over", "PC>2.5"), ("ou", 2.5, "under", "PC<2.5")]},
    "bet365": {"pre": [("1x2", None, "home", "B365H"), ("1x2", None, "draw", "B365D"), ("1x2", None, "away", "B365A"),
                       ("ou", 2.5, "over", "B365>2.5"), ("ou", 2.5, "under", "B365<2.5")],
               "closing": [("1x2", None, "home", "B365CH"), ("1x2", None, "draw", "B365CD"), ("1x2", None, "away", "B365CA"),
                           ("ou", 2.5, "over", "B365C>2.5"), ("ou", 2.5, "under", "B365C<2.5")]},
    "market_max": {"pre": [("1x2", None, "home", "MaxH"), ("1x2", None, "draw", "MaxD"), ("1x2", None, "away", "MaxA"),
                           ("ou", 2.5, "over", "Max>2.5"), ("ou", 2.5, "under", "Max<2.5")],
                   "closing": [("1x2", None, "home", "MaxCH"), ("1x2", None, "draw", "MaxCD"), ("1x2", None, "away", "MaxCA"),
                               ("ou", 2.5, "over", "MaxC>2.5"), ("ou", 2.5, "under", "MaxC<2.5")]},
    "market_avg": {"pre": [("1x2", None, "home", "AvgH"), ("1x2", None, "draw", "AvgD"), ("1x2", None, "away", "AvgA"),
                           ("ou", 2.5, "over", "Avg>2.5"), ("ou", 2.5, "under", "Avg<2.5")],
                   "closing": [("1x2", None, "home", "AvgCH"), ("1x2", None, "draw", "AvgCD"), ("1x2", None, "away", "AvgCA"),
                               ("ou", 2.5, "over", "AvgC>2.5"), ("ou", 2.5, "under", "AvgC<2.5")]},
}
# Older files name the max/average columns differently.
ALIASES = {"MaxH": "BbMxH", "MaxD": "BbMxD", "MaxA": "BbMxA", "AvgH": "BbAvH", "AvgD": "BbAvD", "AvgA": "BbAvA",
           "Max>2.5": "BbMx>2.5", "Max<2.5": "BbMx<2.5", "Avg>2.5": "BbAv>2.5", "Avg<2.5": "BbAv<2.5"}


def _season_label(code: str) -> int:
    """'2425' → 2024 (start year)."""
    return 2000 + int(code[:2])


def read_main(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, encoding="latin-1", on_bad_lines="skip")
    df = df.dropna(subset=["HomeTeam", "AwayTeam", "Date"])
    div, season = path.stem.split("_")
    df["league"] = div
    df["season"] = _season_label(season)
    for k, v in ALIASES.items():
        if k not in df.columns and v in df.columns:
            df[k] = df[v]
    return df


def load(root: Path, divisions=None, seasons=None) -> pd.DataFrame:
    frames = []
    for p in sorted((root / "main").glob("*.csv")):
        div, s = p.stem.split("_")
        if (divisions and div not in divisions) or (seasons and _season_label(s) not in seasons):
            continue
        frames.append(read_main(p))
    return pd.concat(frames, ignore_index=True)


def to_frames(raw: pd.DataFrame) -> dict[str, pd.DataFrame]:
    raw = raw.copy()
    time = raw["Time"].fillna("15:00") if "Time" in raw.columns else "15:00"
    # Kick-off times are UK local time; treat as Europe/London and convert to UTC.
    ko = pd.to_datetime(raw["Date"] + " " + time, dayfirst=True, errors="coerce")
    raw["kickoff"] = ko.dt.tz_localize("Europe/London", ambiguous="NaT", nonexistent="shift_forward").dt.tz_convert("UTC")
    raw = raw.dropna(subset=["kickoff", "FTHG", "FTAG"]).reset_index(drop=True)
    raw["match_id"] = (raw["league"] + "-" + raw["season"].astype(str) + "-" + raw["kickoff"].dt.strftime("%Y%m%d%H%M")
                       + "-" + raw["HomeTeam"].str.replace(" ", "") + "-" + raw["AwayTeam"].str.replace(" ", ""))
    raw = raw.drop_duplicates("match_id")
    matches = pd.DataFrame({
        "match_id": raw["match_id"], "league": raw["league"], "season": raw["season"], "kickoff": raw["kickoff"],
        "home_team": raw["HomeTeam"].str.strip(), "away_team": raw["AwayTeam"].str.strip(),
        "home_goals": raw["FTHG"].astype(float), "away_goals": raw["FTAG"].astype(float),
        "result_available_at": raw["kickoff"] + pd.Timedelta(hours=3), "went_to_extra": False,
        "referee": raw["Referee"] if "Referee" in raw.columns else None,
    })
    stat_map = {"shots": ("HS", "AS"), "shots_on_target": ("HST", "AST"), "corners": ("HC", "AC"),
                "fouls": ("HF", "AF"), "yellow_cards": ("HY", "AY"), "red_cards": ("HR", "AR")}
    home = {"match_id": raw["match_id"], "team": matches["home_team"]}
    away = {"match_id": raw["match_id"], "team": matches["away_team"]}
    for k, (h, a) in stat_map.items():
        home[k] = pd.to_numeric(raw[h], errors="coerce") if h in raw.columns else np.nan
        away[k] = pd.to_numeric(raw[a], errors="coerce") if a in raw.columns else np.nan
    team_stats = pd.concat([pd.DataFrame(home), pd.DataFrame(away)], ignore_index=True)
    rows = []
    for book, kinds in ODDS_COLUMNS.items():
        for kind, cols in kinds.items():
            at = raw["kickoff"] - PRE_ODDS_LEAD if kind == "pre" else raw["kickoff"]
            for market, line, sel, col in cols:
                if col not in raw.columns:
                    continue
                o = pd.to_numeric(raw[col], errors="coerce")
                ok = o > 1.0
                rows.append(pd.DataFrame({"match_id": raw.loc[ok, "match_id"], "bookmaker": book, "market": market,
                                          "line": line, "selection": sel, "odds": o[ok], "kind": kind,
                                          "available_at": at[ok]}))
    odds = pd.concat(rows, ignore_index=True)
    return {"matches": matches.reset_index(drop=True), "team_stats": team_stats, "odds": odds}
