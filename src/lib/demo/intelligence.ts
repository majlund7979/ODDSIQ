// Market Intelligence panel for the live terminal. Every sentence is filled in
// by a fixed template from the match view; nothing is inferred beyond the data,
// and timing is reported as timing, never as a cause.

import type { LiveEvent } from "@/lib/domain/types";
import { fmtPct, fmtPp } from "@/lib/format";
import type { MatchView } from "./store";

export interface Intelligence {
  facts: string[];
  /** General explanations that fit the data; the data cannot tell which applied. */
  possible: string[];
}

export const INTELLIGENCE_NOTE = "Written by fixed templates from the figures on this page. No language model is involved, and nothing here is a recommendation.";

const KEY_KINDS = new Set(["goal", "red", "var"]);

export interface LargestMove {
  minute: number;
  pp: number;
  /** Timeline entries in the same minute or the one before. */
  nearby: LiveEvent[];
}

/** Largest one-minute change in the market probability for a selection. */
export function largestMove(view: MatchView, sel: number): LargestMove | null {
  let best: LargestMove | null = null;
  for (let i = 1; i < view.minutes.length; i++) {
    const pp = (view.minutes[i].market[sel] - view.minutes[i - 1].market[sel]) * 100;
    if (!best || Math.abs(pp) > Math.abs(best.pp)) best = { minute: view.minutes[i].minute, pp, nearby: [] };
  }
  if (best) best.nearby = view.timeline.filter((e) => e.minute >= best!.minute - 1 && e.minute <= best!.minute);
  return best;
}

export function marketIntelligence(view: MatchView, sel: number, regime: { regime: string; reason: string }): Intelligence {
  const e = view.event;
  const name = view.selections[sel]?.name ?? "Selection";
  const first = view.minutes[0];
  const last = view.minutes.at(-1);
  if (!first || !last) {
    return {
      facts: [`${e.homeName} vs ${e.awayName} has no in-play feed in DEMO_MODE yet.`, `Regime: ${regime.regime.toLowerCase()}. ${regime.reason}`],
      possible: [],
    };
  }
  const facts: string[] = [];
  facts.push(`${e.homeName} ${last.score.home}–${last.score.away} ${e.awayName} after ${last.minute} minutes.`);
  const dMarket = (last.market[sel] - first.market[sel]) * 100;
  facts.push(`The market gives ${name} ${fmtPct(last.market[sel])}, ${fmtPp(dMarket)} since kickoff (${fmtPct(first.market[sel])}).`);
  const gap = (last.model[sel] - last.market[sel]) * 100;
  facts.push(`The in-play model gives ${fmtPct(last.model[sel])}, ${Math.abs(gap) < 0.05 ? "level with" : `${Math.abs(gap).toFixed(1)} pp ${gap > 0 ? "above" : "below"}`} the market.`);
  if (Math.abs(gap) >= 5) facts.push("A model–market gap of 5 pp or more is the level the alert engine flags as a discrepancy.");

  const goals = view.timeline.filter((x) => x.kind === "goal").length;
  const reds = view.timeline.filter((x) => x.kind === "red").length;
  facts.push(`${goals} goal${goals === 1 ? "" : "s"} and ${reds} red card${reds === 1 ? "" : "s"} so far.`);

  const move = largestMove(view, sel);
  if (move && Math.abs(move.pp) >= 0.5) {
    const key = move.nearby.filter((x) => KEY_KINDS.has(x.kind));
    const at = `The largest one-minute change for ${name} was ${fmtPp(move.pp)} at ${move.minute}′`;
    facts.push(key.length ? `${at}, recorded in the same minute as: ${key.map((x) => `${x.minute}′ ${x.description}`).join("; ")}.` : `${at}, with no goal, red card or VAR decision recorded in that minute.`);
  }
  facts.push(`Regime: ${regime.regime.toLowerCase()}. ${regime.reason}`);

  const possible = [
    "Match events change the chance of each result, and prices follow.",
    "As time passes with the score unchanged, the leading side's and the draw's probabilities rise.",
    "Bookmakers adjust to each other's prices and to their own exposure, which this data does not show.",
  ];
  return { facts, possible };
}
