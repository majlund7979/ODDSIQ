"""API-Football export (the site's "PE export" workflow, branch pe-export-data) → extra team stats
(xG, shots inside the box) attached to football-data matches.

The two sources name teams differently ("Man United" vs "Manchester United"), so matches are
paired on division, kickoff date (±1 day) and the full-time score, with name similarity breaking
ties. A pairing is only kept when it is unambiguous."""
from __future__ import annotations

from difflib import SequenceMatcher
from pathlib import Path

import numpy as np
import pandas as pd

AF_TO_DIVISION = {39: "E0", 40: "E1", 78: "D1", 79: "D2", 140: "SP1", 141: "SP2", 135: "I1", 136: "I2",
                  61: "F1", 62: "F2", 88: "N1", 94: "P1", 144: "B1", 179: "SC0", 203: "T1", 197: "G1"}
STATS = {"xg": "xg", "shots_inside_box": "shots_inside"}


def load(directory: Path) -> pd.DataFrame:
    files = sorted(Path(directory).glob("*.csv"))
    af = pd.concat([pd.read_csv(f) for f in files if f.stat().st_size], ignore_index=True)
    af = af.drop_duplicates("fixture_id")
    af["kickoff"] = pd.to_datetime(af["kickoff"], utc=True)
    af["league"] = af["league_id"].map(AF_TO_DIVISION)
    return af.dropna(subset=["league", "home_goals", "away_goals"])


def _sim(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def pair(matches: pd.DataFrame, af: pd.DataFrame) -> pd.DataFrame:
    """match_id ↔ fixture_id for matches found in both sources."""
    m = matches.dropna(subset=["home_goals"]).assign(day=lambda d: d["kickoff"].dt.floor("D"))
    a = af.assign(day=af["kickoff"].dt.floor("D"))
    out = []
    for shift in (0, -1, 1):
        cand = m.merge(a.assign(day=a["day"] + pd.Timedelta(days=shift)), on=["league", "day"], suffixes=("", "_af"))
        cand = cand[(cand["home_goals"] == cand["home_goals_af"]) & (cand["away_goals"] == cand["away_goals_af"])]
        out.append(cand[["match_id", "fixture_id", "home_team", "away_team", "home", "away"]].assign(shift=abs(shift)))
    c = pd.concat(out, ignore_index=True)
    c["score"] = [(_sim(h, ha) + _sim(w, wa)) / 2 - 0.1 * s for h, w, ha, wa, s in
                  zip(c["home_team"], c["away_team"], c["home"], c["away"], c["shift"])]
    c = c[c["score"] > 0.35].sort_values("score", ascending=False)
    # Greedy one-to-one: best score first.
    c = c.drop_duplicates("match_id").drop_duplicates("fixture_id")
    return c[["match_id", "fixture_id", "score"]].reset_index(drop=True)


def attach(frames: dict, af: pd.DataFrame) -> tuple[dict, pd.DataFrame]:
    """Adds xg / shots_inside to frames['team_stats'] (NaN where API-Football has none)."""
    p = pair(frames["matches"], af)
    j = p.merge(af, on="fixture_id").merge(frames["matches"][["match_id", "home_team", "away_team"]], on="match_id")
    rows = []
    for side, team in (("home", "home_team"), ("away", "away_team")):
        rows.append(pd.DataFrame({"match_id": j["match_id"], "team": j[team],
                                  **{ours: j[f"{side}_{col}"] for col, ours in STATS.items()}}))
    extra = pd.concat(rows, ignore_index=True)
    ts = frames["team_stats"].drop(columns=[c for c in STATS.values() if c in frames["team_stats"]], errors="ignore")
    frames = {**frames, "team_stats": ts.merge(extra, on=["match_id", "team"], how="left")}
    return frames, p
