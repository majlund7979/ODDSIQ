"""EV / value engine (spec points 16, 25, 28, 41).

For every match, market and selection it compares our probability with the market:

    implied   = 1 / best odds               what the price says, margin included
    p_fair    = de-vigged consensus           the market's own probability
    edge      = p - p_fair                    percentage points
    EV        = p * odds - 1                  per unit staked, at the best price we can get
    EV_low    = p_low * odds - 1              EV at the 95 % lower bound of the shrunk p (uncertainty.py)
    confidence = 100 * P(true edge > 0)

`p` is the blended probability (model pooled with the market, weight fitted walk-forward in
step 5). Bets are ranked by EV_low, which already discounts disagreement, calibration error and
thin history; a bet must also pass every filter in `Filters`. Each rejection carries its reason.

Segment history (league x market) comes from the backtest: a bet is only allowed in a segment
whose out-of-sample record shows an edge (mean CLV > 0 with enough bets, or, without closing
odds, an ROI confidence interval above 0). With today's backtest no segment qualifies, so the
engine recommends nothing — which is the correct output.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from engine.value import uncertainty as unc


@dataclass(frozen=True)
class Filters:
    min_prob: float = 0.20
    min_edge: float = 0.02
    min_ev_low: float = 0.0          # EV must stay positive at the lower bound of p
    min_confidence: float = 60.0
    min_books: int = 3               # odds quality / liquidity
    max_margin: float = 0.08
    min_odds: float = 1.30
    max_odds: float = 6.00
    require_segment_edge: bool = True
    min_segment_bets: int = 300


def segment_history(bets: pd.DataFrame, min_bets: int = 300) -> pd.DataFrame:
    """Out-of-sample record per league x market from backtest bets (step 5 output)."""
    def agg(g):
        roi = g["profit"].sum() / g["stake"].sum()
        boot = [g.sample(len(g), replace=True, random_state=i) for i in range(200)] if len(g) >= 30 else []
        lo = np.quantile([b["profit"].sum() / b["stake"].sum() for b in boot], 0.05) if boot else np.nan
        clv = g["clv"].mean() if "clv" in g and g["clv"].notna().any() else np.nan
        clv_se = g["clv"].std() / np.sqrt(g["clv"].notna().sum()) if not np.isnan(clv) else np.nan
        return pd.Series({"bets": len(g), "roi": roi, "roi_low": lo, "mean_clv": clv,
                          "clv_low": clv - 1.645 * clv_se if not np.isnan(clv) else np.nan})
    h = bets.groupby(["league", "market"]).apply(agg).reset_index()
    has_clv = h["clv_low"].notna()
    h["has_edge"] = (h["bets"] >= min_bets) & np.where(has_clv, h["clv_low"] > 0, h["roi_low"] > 0)
    return h


def evaluate(preds: pd.DataFrame, quotes: pd.DataFrame, history: pd.DataFrame | None = None,
             f: Filters = Filters(), u: unc.Uncertainty = unc.Uncertainty()) -> pd.DataFrame:
    """preds: match_id, league, market, selection, p (blended), p_model, model_spread,
    optional calib_se, n_eff, lineup_known. quotes: output of quotes.quotes (concatenated)."""
    key = ["match_id", "market", "selection"]
    v = preds.merge(quotes.drop(columns=["line"], errors="ignore"), on=key, how="inner")
    v["odds"] = v["odds_best"]
    v["implied"] = 1 / v["odds"]
    v["edge"] = v["p"] - v["p_fair"]
    v["ev"] = v["p"] * v["odds"] - 1
    v["sigma"] = unc.sigma(v["model_spread"].fillna(0.0), v.get("calib_se"), v.get("n_eff"),
                           bool(v["lineup_known"].all()) if "lineup_known" in v else False, u)
    mean, psd = unc.posterior(v["edge"], v["sigma"], u)
    v["p_shrunk"] = v["p_fair"] + mean                       # our probability after shrinking the edge
    v["p_low"] = np.clip(v["p_shrunk"] - 1.645 * psd, 0, 1)  # one-sided 95 % lower bound
    v["ev_low"] = v["p_low"] * v["odds"] - 1
    v["confidence"] = unc.confidence(v["edge"], v["sigma"], u).round(0)
    if history is not None and len(history):
        v = v.merge(history[["league", "market", "bets", "roi", "mean_clv", "has_edge"]]
                    .rename(columns={"bets": "hist_bets", "roi": "hist_roi", "mean_clv": "hist_clv"}),
                    on=["league", "market"], how="left")
    else:
        v["has_edge"] = False
    v["has_edge"] = v["has_edge"].fillna(False).astype(bool)
    checks = {
        "sandsynlighed under minimum": v["p"] < f.min_prob,
        "edge under minimum": v["edge"] < f.min_edge,
        "EV negativ ved usikkerhed": v["ev_low"] < f.min_ev_low,
        "confidence under minimum": v["confidence"] < f.min_confidence,
        "for få bookmakere": v["books"] < f.min_books,
        "for høj margin": v["margin"] > f.max_margin,
        "odds uden for interval": (v["odds"] < f.min_odds) | (v["odds"] > f.max_odds),
    }
    if f.require_segment_edge:
        checks["ingen dokumenteret edge i liga/marked"] = ~v["has_edge"]
    reasons = pd.DataFrame(checks)
    v["rejected_because"] = reasons.apply(lambda r: "; ".join(k for k, bad in r.items() if bad), axis=1)
    v["is_bet"] = v["rejected_because"] == ""
    # One selection per match and market; rank by the conservative EV.
    v = v.sort_values("ev_low", ascending=False)
    v["best_in_market"] = ~v.duplicated(["match_id", "market"])
    v["rank"] = np.where(v["is_bet"] & v["best_in_market"],
                         (v["is_bet"] & v["best_in_market"]).cumsum(), np.nan)
    return v.reset_index(drop=True)


def ranking_table(v: pd.DataFrame, only_bets: bool = True) -> pd.DataFrame:
    """Spec point 28: RANK | MATCH | MARKET | ODDS | MODEL PROBABILITY | IMPLIED | EDGE | EV | CONFIDENCE."""
    t = v[v["is_bet"] & v["best_in_market"]] if only_bets else v[v["best_in_market"]]
    t = t.sort_values("ev_low", ascending=False)
    return pd.DataFrame({"rank": range(1, len(t) + 1), "match": t["match_id"], "market": t["market"] + " " + t["selection"],
                         "odds": t["odds"].round(2), "model_p": (100 * t["p"]).round(1), "implied_p": (100 * t["implied"]).round(1),
                         "edge_pp": (100 * t["edge"]).round(1), "ev_pct": (100 * t["ev"]).round(1),
                         "ev_low_pct": (100 * t["ev_low"]).round(1), "confidence": t["confidence"].astype(int),
                         "book": t["best_book"], "why_not": t["rejected_because"]})


def match_card(name: str, probs: dict, v: pd.DataFrame) -> str:
    """Spec point 41 output for one match. probs: {'home': .., 'draw': .., 'away': .., 'over25': .., 'btts': ..}."""
    lines = [f"KAMP: {name}"]
    labels = {"home": "HJEMMESEJR", "draw": "UAFGJORT", "away": "UDESEJR", "over25": "OVER 2.5", "btts": "BTTS"}
    lines += [f"{labels[k]}: {100 * p:.1f} %" for k, p in probs.items() if k in labels]
    bets = v[v["is_bet"] & v["best_in_market"]].sort_values("ev_low", ascending=False)
    if bets.empty:
        best = v.sort_values("ev_low", ascending=False).iloc[0] if len(v) else None
        lines.append("BEDSTE VALUE BET: ingen")
        if best is not None:
            lines.append(f"  Nærmest: {best['market']} {best['selection']} @ {best['odds']:.2f}, "
                         f"edge {100 * best['edge']:+.1f} pp, EV {100 * best['ev']:+.1f} %, "
                         f"confidence {int(best['confidence'])}/100 — afvist: {best['rejected_because']}")
        return "\n".join(lines)
    b = bets.iloc[0]
    lines += [f"BEDSTE VALUE BET: {b['market']} {b['selection']} ({b['best_book']})", f"ODDS: {b['odds']:.2f}",
              f"MODEL-SANDSYNLIGHED: {100 * b['p']:.1f} %", f"IMPLICIT SANDSYNLIGHED: {100 * b['implied']:.1f} %",
              f"EDGE: {100 * b['edge']:+.1f} pp (mod markedets fair {100 * b['p_fair']:.1f} %)",
              f"EV: {100 * b['ev']:+.1f} % (ved nedre grænse {100 * b['ev_low']:+.1f} %)",
              f"CONFIDENCE: {int(b['confidence'])}/100"]
    return "\n".join(lines)
