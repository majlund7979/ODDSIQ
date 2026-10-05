"""Fatigue and schedule: rest days, congestion, extra time, travel, and the next
known fixture (a big match soon after is a rotation risk). Fixtures are known in
advance, so scheduled future kickoffs are legitimate inputs; their results are not.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd


def haversine_km(lat1, lon1, lat2, lon2) -> float:
    if any(pd.isna(v) for v in (lat1, lon1, lat2, lon2)):
        return float("nan")
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def team_schedule(all_matches: pd.DataFrame) -> pd.DataFrame:
    """All fixtures (any competition, played or not) per team: team, kickoff, match_id, competition kind,
    went_to_extra, venue lat/lon."""
    cols = ["match_id", "kickoff", "league"]
    extra = [c for c in ("went_to_extra", "venue_lat", "venue_lon", "kind") if c in all_matches.columns]
    h = all_matches[cols + extra].assign(team=all_matches["home_team"])
    a = all_matches[cols + extra].assign(team=all_matches["away_team"])
    return pd.concat([h, a], ignore_index=True).sort_values(["team", "kickoff"]).reset_index(drop=True)


def fatigue_features(targets: pd.DataFrame, schedule: pd.DataFrame) -> pd.DataFrame:
    """Per side: days since last match, matches in the previous 7/14 days, extra time in the last match,
    km travelled to this venue from the last venue, days to next match and whether it is continental."""
    sched = {t: g.reset_index(drop=True) for t, g in schedule.groupby("team")}
    cols = {}
    for side in ("home", "away"):
        team_col = targets[f"{side}_team"].to_numpy()
        ko = targets["kickoff"].to_numpy(dtype="datetime64[ns]")
        cut = targets["cutoff"].to_numpy(dtype="datetime64[ns]")
        n = len(targets)
        rest, n7, n14, extra, travel, to_next, next_cont = (np.full(n, np.nan), np.zeros(n, int), np.zeros(n, int),
                                                            np.zeros(n, bool), np.full(n, np.nan), np.full(n, np.nan),
                                                            np.zeros(n, bool))
        for team, idx in pd.Series(np.arange(n)).groupby(team_col):
            g = sched.get(team)
            if g is None:
                continue
            k = g["kickoff"].to_numpy(dtype="datetime64[ns]")
            pos = idx.to_numpy()
            before = np.searchsorted(k, ko[pos], side="left")          # matches strictly before kickoff
            after = np.searchsorted(k, ko[pos], side="right")          # first match strictly after
            b7 = np.searchsorted(k, ko[pos] - np.timedelta64(7, "D"), side="left")
            b14 = np.searchsorted(k, ko[pos] - np.timedelta64(14, "D"), side="left")
            n7[pos], n14[pos] = before - b7, before - b14
            has_last = before > 0
            li = np.clip(before - 1, 0, len(k) - 1)
            rest[pos] = np.where(has_last, (ko[pos] - k[li]) / np.timedelta64(1, "D"), np.nan)
            known = has_last & (k[li] + np.timedelta64(3, "h") < cut[pos])
            if "went_to_extra" in g:
                extra[pos] = known & g["went_to_extra"].fillna(False).to_numpy(bool)[li]
            if "venue_lat" in g and "venue_lat" in targets:
                for q, p_ in enumerate(pos):
                    if has_last[q]:
                        travel[p_] = haversine_km(g["venue_lat"].iat[li[q]], g["venue_lon"].iat[li[q]],
                                                  targets["venue_lat"].iat[p_], targets["venue_lon"].iat[p_])
            has_next = after < len(k)
            ni = np.clip(after, 0, len(k) - 1)
            to_next[pos] = np.where(has_next, (k[ni] - ko[pos]) / np.timedelta64(1, "D"), np.nan)
            if "kind" in g:
                next_cont[pos] = has_next & (g["kind"].to_numpy()[ni] == "continental")
        cols.update({f"{side}_rest_days": rest, f"{side}_n7": n7, f"{side}_n14": n14, f"{side}_last_extra_time": extra,
                     f"{side}_travel_km": travel, f"{side}_days_to_next": to_next, f"{side}_next_is_continental": next_cont})
    out = pd.DataFrame(cols, index=targets.index)
    out["diff_rest_days"] = out["home_rest_days"] - out["away_rest_days"]
    return out
