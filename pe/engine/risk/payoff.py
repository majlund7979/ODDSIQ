"""What each bet returns for every possible score (spec point 30).

All goal markets on one match are functions of the same score, so their joint distribution is
exact: the score matrix from step 4. payoff(bet, matrix shape) gives the return per unit staked
for every (home, away) score: odds - 1 when won, -1 when lost, 0 on a push, and halves for
quarter Asian handicap lines. Correlation between two bets is then a sum over the matrix,
with no Monte Carlo noise.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class Bet:
    match_id: str
    market: str            # 1x2, dc, dnb, ou, btts, ah, team_ou
    selection: str         # home/draw/away, 1x/x2/12, over/under, yes/no, home/away
    odds: float
    line: float | None = None
    p: float | None = None         # probability (shrunk, step 6) for markets without a score matrix
    league: str = ""


def _grid(shape):
    return np.indices(shape)


def _settle_line(margin: np.ndarray, line: float, odds: float) -> np.ndarray:
    """margin + line > 0 wins, == 0 push; quarter lines are split in two half stakes."""
    if abs(line * 4 - round(line * 4)) < 1e-9 and abs(line * 2 - round(line * 2)) > 1e-9:
        return 0.5 * _settle_line(margin, line - 0.25, odds) + 0.5 * _settle_line(margin, line + 0.25, odds)
    x = margin + line
    return np.where(x > 1e-9, odds - 1, np.where(x < -1e-9, -1.0, 0.0))


def payoff(b: Bet, shape=(11, 11)) -> np.ndarray:
    h, a = _grid(shape)
    o = b.odds
    win = lambda cond: np.where(cond, o - 1, -1.0)  # noqa: E731
    if b.market == "1x2":
        return win({"home": h > a, "draw": h == a, "away": h < a}[b.selection])
    if b.market == "dc":
        return win({"1x": h >= a, "x2": h <= a, "12": h != a}[b.selection])
    if b.market == "dnb":
        return _settle_line(h - a if b.selection == "home" else a - h, 0.0, o)
    if b.market == "ou":
        return _settle_line(h + a if b.selection == "over" else -(h + a), -b.line if b.selection == "over" else b.line, o)
    if b.market == "btts":
        both = (h > 0) & (a > 0)
        return win(both if b.selection == "yes" else ~both)
    if b.market == "ah":
        return _settle_line(h - a if b.selection == "home" else a - h, b.line, o)
    if b.market == "team_ou":
        side, direction = b.selection.split("_")          # e.g. home_over
        goals = h if side == "home" else a
        return _settle_line(goals if direction == "over" else -goals, -b.line if direction == "over" else b.line, o)
    raise ValueError(f"no score payoff for market {b.market}")


def correlation(b1: Bet, b2: Bet, matrix: np.ndarray) -> float:
    """Correlation of the two bets' returns under the score distribution."""
    p = matrix / matrix.sum()
    x, y = payoff(b1, matrix.shape), payoff(b2, matrix.shape)
    mx, my = (p * x).sum(), (p * y).sum()
    cov = (p * (x - mx) * (y - my)).sum()
    return float(cov / np.sqrt((p * (x - mx) ** 2).sum() * (p * (y - my) ** 2).sum()))
