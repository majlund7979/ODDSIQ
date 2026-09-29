// Market alert engine over the DEMO_MODE universe. Every alert is derived
// from data the terminal already shows (price paths, news items, ledgered
// predictions, live match events) and carries the time it would have fired.

import { fmtOdds, fmtPct, fmtSignedPct } from "@/lib/format";
import { edgePp } from "@/lib/metrics/value";
import { BOOKMAKERS, leagueById, SPORTS, teamById } from "./catalog";
import { feedTime, ledgeredPrediction, marketRows, statusAt, universeEvents } from "./store";
import { consensusPrice, fairProbabilities, HOUR, MIN, showcaseLiveEvents, bookPrice, type EventSim } from "./universe";

export type AlertType =
  | "ODDS_MOVEMENT"
  | "MODEL_MARKET_DISCREPANCY"
  | "LINEUP_CHANGE"
  | "INJURY_UPDATE"
  | "MARKET_SUSPENSION"
  | "ODDS_STALE"
  | "UNUSUAL_VOLATILITY"
  | "MODEL_CONFIDENCE_CHANGE";

export const ALERT_TYPES: { id: AlertType; label: string; rule: string }[] = [
  { id: "ODDS_MOVEMENT", label: "Odds movement", rule: "Consensus price moves 3% or more within 30 minutes of a news item." },
  { id: "MODEL_MARKET_DISCREPANCY", label: "Model-market discrepancy", rule: "A ledgered prediction differs from the margin-free market probability by 5 pp or more when recorded." },
  { id: "LINEUP_CHANGE", label: "Lineup change", rule: "Lineups confirmed or squad rotation reported." },
  { id: "INJURY_UPDATE", label: "Injury update", rule: "Injury, suspension or return reported." },
  { id: "MARKET_SUSPENSION", label: "Market suspension", rule: "In-play market suspended after a goal or red card." },
  { id: "ODDS_STALE", label: "Odds stale", rule: "Five minutes after a news-driven move, a bookmaker's price still differs from consensus by 3% or more." },
  { id: "UNUSUAL_VOLATILITY", label: "Unusual volatility", rule: "24-hour price volatility at least 3× the median across tracked pre-match markets." },
  { id: "MODEL_CONFIDENCE_CHANGE", label: "Model confidence change", rule: "Not generated in DEMO_MODE: each prediction's confidence is fixed when it is ledgered." },
];

export interface MarketAlert {
  id: string;
  type: AlertType;
  at: number;
  eventId: string;
  selectionId?: string;
  sport: string;
  league: string;
  match: string;
  market?: string;
  selection?: string;
  headline: string;
  fields: { label: string; value: string }[];
}

export const ALERT_WINDOW_HOURS = 24;
const MOVE_ALERT = 0.03;
const DISCREPANCY_PP = 5;
const STALE_GAP = 0.03;
const VOLATILITY_MULTIPLE = 3;

function base(ev: EventSim) {
  return {
    eventId: ev.event.id,
    sport: SPORTS.find((s) => s.id === ev.event.sportId)!.name,
    league: leagueById.get(ev.event.leagueId)!.name,
    match: `${teamById.get(ev.event.homeTeamId)!.name} vs ${teamById.get(ev.event.awayTeamId)!.name}`,
  };
}

/** Wall-clock time of a match minute, allowing for the 15-minute half-time break. */
const minuteAt = (ev: EventSim, minute: number) => ev.event.kickoff + (minute <= 45 ? minute : minute + 15) * MIN;

let cache: { at: number; alerts: MarketAlert[] } | null = null;

/** Alerts fired in the last `ALERT_WINDOW_HOURS`, newest first. */
export function marketAlerts(now: number): MarketAlert[] {
  const t = feedTime(now);
  if (cache?.at === t) return cache.alerts;
  const from = t - ALERT_WINDOW_HOURS * HOUR;
  const out: MarketAlert[] = [];
  const inWindow = (at: number) => at > from && at <= t;

  for (const ev of universeEvents(t)) {
    if (ev.openAt > t || ev.event.kickoff + ev.durationMin * MIN < from) continue;
    const b = base(ev);

    for (const [ni, n] of ev.news.entries()) {
      if (n.at > ev.event.kickoff) continue;
      if (inWindow(n.at) && n.kind !== "weather") {
        out.push({
          ...b,
          id: `${ev.event.id}-news-${ni}`,
          type: n.kind === "lineup" || n.kind === "rotation" ? "LINEUP_CHANGE" : "INJURY_UPDATE",
          at: n.at,
          headline: n.text,
          fields: [{ label: "Kickoff in", value: `${Math.max(0, Math.round((ev.event.kickoff - n.at) / HOUR))}h` }],
        });
      }
      const detectedAt = Math.min(n.at + 30 * MIN, ev.event.kickoff);
      for (const m of ev.markets) {
        m.selections.forEach((s, i) => {
          const before = consensusPrice(ev, m, i, n.at - 5 * MIN);
          const after = consensusPrice(ev, m, i, detectedAt);
          const move = after / before - 1;
          if (inWindow(detectedAt) && Math.abs(move) >= MOVE_ALERT) {
            const pred = ledgeredPrediction(s.selection.id, detectedAt);
            const market = fairProbabilities(ev, m, detectedAt)[i];
            out.push({
              ...b,
              id: `${s.selection.id}-move-${ni}`,
              type: "ODDS_MOVEMENT",
              at: detectedAt,
              selectionId: s.selection.id,
              market: m.market.name,
              selection: s.selection.name,
              headline: `Odds moved ${fmtOdds(before)} → ${fmtOdds(after)}`,
              fields: [
                { label: "Movement", value: fmtSignedPct(move) },
                { label: "Model", value: pred ? fmtPct(pred.probability) : "pending" },
                { label: "Market", value: fmtPct(market) },
              ],
            });
          }
          // Stale quotes: books whose price has not caught up with a news-driven move.
          const checkAt = n.at + 5 * MIN;
          if (i === 0 && inWindow(checkAt) && checkAt < ev.event.kickoff && Math.abs(move) >= MOVE_ALERT) {
            const cons = consensusPrice(ev, m, i, checkAt);
            BOOKMAKERS.forEach((bk, j) => {
              const o = bookPrice(ev, m, i, j, checkAt);
              if (!Number.isNaN(o) && Math.abs(o / cons - 1) >= STALE_GAP && ev.bookLagMin[j] >= 5) {
                out.push({
                  ...b,
                  id: `${s.selection.id}-stale-${ni}-${bk.id}`,
                  type: "ODDS_STALE",
                  at: checkAt,
                  selectionId: s.selection.id,
                  market: m.market.name,
                  selection: s.selection.name,
                  headline: `${bk.name} still quoting ${fmtOdds(o)} vs consensus ${fmtOdds(cons)}`,
                  fields: [
                    { label: "Gap", value: fmtSignedPct(o / cons - 1) },
                    { label: "Quote age", value: `~${Math.round(ev.bookLagMin[j])} min` },
                  ],
                });
              }
            });
          }
        });
      }
    }

    // Discrepancy at the moment a prediction is ledgered.
    if (inWindow(ev.predictionAt)) {
      for (const m of ev.markets) {
        const fair = fairProbabilities(ev, m, ev.predictionAt);
        m.selections.forEach((s, i) => {
          const pred = ledgeredPrediction(s.selection.id, t);
          if (!pred) return;
          const diff = edgePp(pred.probability, fair[i]);
          if (Math.abs(diff) < DISCREPANCY_PP) return;
          out.push({
            ...b,
            id: `${s.selection.id}-disc`,
            type: "MODEL_MARKET_DISCREPANCY",
            at: pred.createdAt,
            selectionId: s.selection.id,
            market: m.market.name,
            selection: s.selection.name,
            headline: `Model ${fmtPct(pred.probability)} vs market ${fmtPct(fair[i])}`,
            fields: [
              { label: "Difference", value: `${diff >= 0 ? "+" : "−"}${Math.abs(diff).toFixed(1)} pp` },
              { label: "Price", value: fmtOdds(pred.odds) },
              { label: "Model", value: pred.modelVersionId },
            ],
          });
        });
      }
    }

    if (ev.match && statusAt(ev, t) !== "scheduled") out.push(...suspensions(ev, b, inWindow));
  }

  for (const ev of showcaseLiveEvents(t)) if (ev.match && statusAt(ev, t) !== "scheduled") out.push(...suspensions(ev, base(ev), inWindow));

  // Volatility is judged against the current cross-section of pre-match markets.
  const pre = marketRows(t).filter((r) => r.status === "scheduled");
  const vols = pre.map((r) => r.volatility).sort((a, c) => a - c);
  const median = vols[Math.floor(vols.length / 2)] ?? 0;
  for (const r of pre) {
    if (median > 0 && r.volatility >= VOLATILITY_MULTIPLE * median) {
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
          { label: "24h volatility", value: `${(r.volatility * 100).toFixed(2)}%` },
          { label: "Current", value: fmtOdds(r.currentOdds) },
        ],
      });
    }
  }

  out.sort((a, c) => c.at - a.at || (a.id < c.id ? -1 : 1));
  cache = { at: t, alerts: out };
  return out;
}

function suspensions(ev: EventSim, b: ReturnType<typeof base>, inWindow: (at: number) => boolean): MarketAlert[] {
  const out: MarketAlert[] = [];
  const m = ev.markets[0];
  for (const e of ev.match!.timeline) {
    if (e.kind !== "goal" && e.kind !== "red") continue;
    const at = minuteAt(ev, e.minute);
    if (!inWindow(at)) continue;
    out.push({
      ...b,
      id: `${ev.event.id}-susp-${e.minute}-${e.kind}-${e.team}`,
      type: "MARKET_SUSPENSION",
      at,
      market: m.market.name,
      headline: `${m.market.name} suspended: ${e.description} (${e.minute}′)`,
      fields: [
        ...(e.modelBefore !== undefined && e.modelAfter !== undefined ? [{ label: "Model, home win", value: `${fmtPct(e.modelBefore)} → ${fmtPct(e.modelAfter)}` }] : []),
      ],
    });
  }
  return out;
}
