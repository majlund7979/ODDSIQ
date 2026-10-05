import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def make_league(seed: int = 7, teams: int = 10, seasons=(2024, 2025)) -> dict[str, pd.DataFrame]:
    """Synthetic double round-robin with known team strengths, team stats and player minutes."""
    rng = np.random.default_rng(seed)
    names = [f"T{i}" for i in range(teams)]
    attack = dict(zip(names, rng.normal(0, 0.3, teams)))
    defence = dict(zip(names, rng.normal(0, 0.3, teams)))
    rows, stats, players = [], [], []
    mid = 0
    for season in seasons:
        day = pd.Timestamp(f"{season}-08-01 15:00", tz="UTC")
        pairs = [(h, a) for h in names for a in names if h != a]
        rng.shuffle(pairs)
        for i, (h, a) in enumerate(pairs):
            kickoff = day + pd.Timedelta(days=3 * (i // (teams // 2)))
            lam_h = np.exp(0.25 + attack[h] - defence[a])
            lam_a = np.exp(attack[a] - defence[h])
            gh, ga = rng.poisson(lam_h), rng.poisson(lam_a)
            mid += 1
            rows.append(dict(match_id=mid, league="L1", season=season, kickoff=kickoff, home_team=h, away_team=a,
                             home_goals=gh, away_goals=ga, result_available_at=kickoff + pd.Timedelta(hours=3),
                             went_to_extra=False, venue_lat=55 + names.index(h) * 0.1, venue_lon=12.0,
                             referee=f"R{mid % 4}"))
            for team, lam, red in ((h, lam_h, int(rng.random() < 0.05)), (a, lam_a, int(rng.random() < 0.05))):
                stats.append(dict(match_id=mid, team=team, xg=lam + rng.normal(0, 0.2), shots=rng.poisson(lam * 8),
                                  shots_on_target=rng.poisson(lam * 3), corners=rng.poisson(5), yellow_cards=rng.poisson(2),
                                  red_cards=red))
                for p in range(14):
                    minutes = 90 if p < 10 else (rng.integers(0, 45) if p < 13 else 0)
                    if minutes == 0:
                        continue
                    players.append(dict(match_id=mid, team=team, player=f"{team}-P{p}", minutes=int(minutes),
                                        rating=7.0 - p * 0.05, goals=int(p >= 8 and rng.random() < 0.2),
                                        assists=0, shots=int(p >= 6) * 2, key_passes=1, tackles=int(p < 6) * 2,
                                        interceptions=1, position="G" if p == 0 else "D" if p < 5 else "M" if p < 8 else "F",
                                        kickoff=kickoff, available_at=kickoff + pd.Timedelta(hours=6)))
    matches = pd.DataFrame(rows)
    return {"matches": matches, "team_stats": pd.DataFrame(stats), "player_stats": pd.DataFrame(players),
            "attack": attack, "defence": defence}


@pytest.fixture(scope="session")
def league():
    return make_league()
