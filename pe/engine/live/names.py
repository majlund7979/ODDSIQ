"""Team names across sources.

History (football-data / xgabora) says "Man City"; the site's feeds (API-Football, The Odds API)
say "Manchester City". team_aliases.csv was learned by pairing 2020-2026 API-Football fixtures with
football-data matches on division, date and score (af_export.pair), keeping pairs seen >= 5 times.
football-data itself renamed some teams over the years ("Nottm Forest" → "Nott'm Forest"), so
`canonical_history` maps every older spelling to the newest one before features are built.

A site name without an alias falls back to fuzzy matching against the teams that played in the
same country group recently. Below `MIN_SCORE` the match is left out and logged, never guessed.
"""
from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

import pandas as pd

ALIASES = Path(__file__).with_name("team_aliases.csv")
MIN_SCORE = 0.72
STOP = {"fc", "afc", "cf", "sc", "ac", "as", "ss", "us", "sv", "vfb", "vfl", "tsg", "fk", "sk", "kv", "kvc", "krc",
        "rc", "rcd", "cd", "ud", "sd", "club", "de", "calcio", "1", "04", "05", "1899", "1846", "1860", "1907", "1909"}
# Reserve and youth sides are different teams ("Celta B" is not "Celta").
RESERVE = {"b", "ii", "2", "u19", "u21", "u23", "jong", "w", "women"}


def norm(name: str) -> str:
    s = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    return " ".join(t for t in s.split() if t not in STOP)


def similarity(a: str, b: str) -> float:
    """Character similarity, lifted when every word of the shorter name starts a word of the longer
    ("man city" vs "manchester city")."""
    na, nb = norm(a), norm(b)
    if not na or not nb:
        return 0.0
    if (set(na.split()) & RESERVE) != (set(nb.split()) & RESERVE):
        return 0.0
    if na == nb:
        return 1.0
    s = SequenceMatcher(None, na, nb).ratio()
    ta, tb = na.split(), nb.split()
    short, long_ = (ta, tb) if len(ta) <= len(tb) else (tb, ta)
    if all(any(w.startswith(x) or x.startswith(w) for w in long_) for x in short if len(x) >= 3) and \
            any(len(x) >= 3 for x in short):
        s = max(s, 0.85)
    return s


def load_aliases(path: Path = ALIASES) -> pd.DataFrame:
    return pd.read_csv(path)


def history_renames(aliases: pd.DataFrame) -> dict[str, str]:
    """Older football-data spelling → newest spelling of the same club."""
    out = {}
    for _, g in aliases.groupby("af"):
        g = g.sort_values("last_seen")
        newest = g["fd"].iloc[-1]
        for old in g["fd"].iloc[:-1]:
            if old != newest:
                out[old] = newest
    # Chains (a → b, b → c) resolve to the end.
    for k in list(out):
        seen = {k}
        while out[k] in out and out[k] not in seen:
            seen.add(out[k])
            out[k] = out[out[k]]
    return out


def canonical_history(frames: dict, aliases: pd.DataFrame) -> dict:
    ren = history_renames(aliases)
    m = frames["matches"].copy()
    m["home_team"] = m["home_team"].replace(ren)
    m["away_team"] = m["away_team"].replace(ren)
    ts = frames["team_stats"].copy()
    ts["team"] = ts["team"].replace(ren)
    return {**frames, "matches": m, "team_stats": ts}


def site_to_history(site_names, candidates, aliases: pd.DataFrame) -> pd.DataFrame:
    """site name → history name. candidates: history names of the group's recent teams.
    Returns site, team (None when unmatched), score, how ('alias' | 'fuzzy' | 'none')."""
    ren = history_renames(aliases)
    newest = aliases.sort_values("last_seen").drop_duplicates("af", keep="last").set_index("af")["fd"]
    by_norm = {norm(a): ren.get(f, f) for a, f in newest.items()}
    cand = sorted(set(candidates))
    rows = []
    for s in sorted(set(site_names)):
        hit = newest.get(s)
        hit = ren.get(hit, hit) if hit is not None else by_norm.get(norm(s))
        if hit is not None and hit in cand:
            rows.append((s, hit, 1.0, "alias"))
            continue
        best = max(((similarity(s, c), c) for c in cand), default=(0.0, None))
        if best[0] >= MIN_SCORE:
            rows.append((s, best[1], best[0], "fuzzy"))
        else:
            rows.append((s, None, best[0], "none"))
    out = pd.DataFrame(rows, columns=["site", "team", "score", "how"])
    # Two site names on one history team: keep the better one only.
    dup = out["team"].notna() & out.sort_values("score", ascending=False).duplicated("team").reindex(out.index)
    out.loc[dup, ["team", "how"]] = [None, "none"]
    return out
