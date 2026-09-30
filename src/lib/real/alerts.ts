// Market alerts over live feed data. Same alert shapes as the demo engine, but
// only the rules the stored data can support: prices arrive once per feed run,
// so movement is measured between runs, and there are no in-play suspensions
// or news-timed stale quotes.

import { ALERT_TYPES, ALERT_WINDOW_HOURS, type AlertType, type MarketAlert } from "@/lib/demo/alerts";
import { fmtOdds, fmtPct, fmtSignedPct } from "@/lib/format";
import { edgePp } from "@/lib/metrics/value";
import { consensusAt, type RealSnapshot } from "./store";

const HOUR = 3_600_000;
const MOVE_ALERT = 0.03;
const DISCREPANCY_PP = 5;
const VOLATILITY_MULTIPLE = 3;

const LIVE_RULES: Partial<Record<AlertType, string>> = {
  ODDS_MOVEMENT: "Consensus price moves 3% or more between two feed runs.",
  LINEUP_CHANGE: "Both starting lineups published by the statistics feed.",
  INJURY_UPDATE: "The statistics feed lists players out or doubtful (checked from two days before kickoff).",
  MARKET_SUSPENSION: "Not generated on live data: prices are stored before kickoff only.",
  ODDS_STALE: "Not generated on live data: prices arrive once per feed run, so quote ages are not known.",
  MODEL_CONFIDENCE_CHANGE: "Not generated: each prediction's confidence is fixed when it is ledgered.",
};

/** Alert rules as they apply to live data. */
export const LIVE_ALERT_TYPES = ALERT_TYPES.map((t) => ({ ...t, rule: LIVE_RULES[t.id] ?? t.rule }));

export function realAlerts(snap: RealSnapshot): MarketAlert[] {
  const now = snap.now;
  const from = now - ALERT_WINDOW_HOURS * HOUR;
  const inWindow = (at: number) => at > from && at <= now;
  const out: MarketAlert[] = [];

  for (const e of snap.events) {
    const b = { eventId: e.view.id, sport: e.view.sportName, league: e.view.leagueName, match: `${e.view.homeName} vs ${e.view.awayName}` };

    for (const m of e.markets) {
      const runs = m.runs.filter((r) => r <= Math.min(now, e.view.kickoff));
      for (let k = 1; k < runs.length; k++) {
        if (!inWindow(runs[k])) continue;
        const before = consensusAt(m, runs[k - 1]);
        const after = consensusAt(m, runs[k]);
        if (!before || !after) continue;
        m.selections.forEach((s, i) => {
          const move = after.selections[i].medianOdds / before.selections[i].medianOdds - 1;
          if (Math.abs(move) < MOVE_ALERT) return;
          const pred = snap.predictionsBySelection.get(s.id);
          out.push({
            ...b,
            id: `${s.id}-move-${runs[k]}`,
            type: "ODDS_MOVEMENT",
            at: runs[k],
            selectionId: s.id,
            market: m.name,
            selection: s.name,
            headline: `Odds moved ${fmtOdds(before.selections[i].medianOdds)} → ${fmtOdds(after.selections[i].medianOdds)} between feed runs`,
            fields: [
              { label: "Movement", value: fmtSignedPct(move) },
              { label: "Model", value: pred && pred.createdAt <= runs[k] ? fmtPct(pred.probability) : "pending" },
              { label: "Market", value: fmtPct(after.selections[i].fairProbability) },
            ],
          });
        });
      }
    }

    const news = e.news;
    if (news?.lineupsAt && news.lineups.length === 2 && inWindow(news.lineupsAt)) {
      out.push({ ...b, id: `${e.view.id}-lineups`, type: "LINEUP_CHANGE", at: news.lineupsAt, headline: `Lineups confirmed: ${news.lineups.map((l) => `${l.team} ${l.formation ?? ""}`.trim()).join(", ")}`, fields: [{ label: "Kickoff in", value: `${Math.max(0, Math.round((e.view.kickoff - news.lineupsAt) / 60_000))} min` }] });
    }
    if (news?.injuriesAt && news.injuries.length && inWindow(news.injuriesAt)) {
      const out_ = news.injuries.filter((i) => i.status === "out").length;
      out.push({
        ...b,
        id: `${e.view.id}-injuries-${news.injuriesAt}`,
        type: "INJURY_UPDATE",
        at: news.injuriesAt,
        headline: news.injuries.slice(0, 3).map((i) => `${i.player} (${i.team}, ${i.status === "out" ? "out" : "doubtful"})`).join("; ") + (news.injuries.length > 3 ? ` and ${news.injuries.length - 3} more` : ""),
        fields: [
          { label: "Out", value: String(out_) },
          { label: "Doubtful", value: String(news.injuries.length - out_) },
        ],
      });
    }
  }

  for (const r of snap.ledger) {
    const p = r.prediction;
    if (!inWindow(p.createdAt)) continue;
    const diff = edgePp(p.probability, r.marketProbabilityAtPrediction);
    if (Math.abs(diff) < DISCREPANCY_PP) continue;
    out.push({
      eventId: r.event.id,
      sport: r.event.sportName,
      league: r.event.leagueName,
      match: `${r.event.homeName} vs ${r.event.awayName}`,
      id: `${p.selectionId}-disc`,
      type: "MODEL_MARKET_DISCREPANCY",
      at: p.createdAt,
      selectionId: p.selectionId,
      market: r.marketName,
      selection: r.selectionName,
      headline: `Model ${fmtPct(p.probability)} vs market ${fmtPct(r.marketProbabilityAtPrediction)}`,
      fields: [
        { label: "Difference", value: `${diff >= 0 ? "+" : "−"}${Math.abs(diff).toFixed(1)} pp` },
        { label: "Price", value: fmtOdds(p.odds) },
        { label: "Model", value: p.modelVersionId },
      ],
    });
  }

  const pre = snap.rows.filter((r) => r.status === "scheduled");
  const vols = pre.map((r) => r.volatility).sort((a, c) => a - c);
  const median = vols[Math.floor(vols.length / 2)] ?? 0;
  for (const r of pre) {
    if (median > 0 && r.volatility >= VOLATILITY_MULTIPLE * median && inWindow(r.lastUpdate)) {
      out.push({
        eventId: r.eventId,
        id: `${r.selectionId}-vol`,
        type: "UNUSUAL_VOLATILITY",
        at: r.lastUpdate,
        sport: r.sport,
        league: r.league,
        match: r.match,
        selectionId: r.selectionId,
        market: r.market,
        selection: r.selection,
        headline: `Volatility ${(r.volatility / median).toFixed(1)}× the market median`,
        fields: [
          { label: "Volatility", value: `${(r.volatility * 100).toFixed(2)}%` },
          { label: "Current", value: fmtOdds(r.currentOdds) },
        ],
      });
    }
  }

  return out.sort((a, c) => c.at - a.at || (a.id < c.id ? -1 : 1));
}
