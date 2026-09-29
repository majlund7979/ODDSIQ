// Movement detectors. They describe price behaviour only: none of them can
// know who moved a price or why, and the wording never claims to.

import { fmtOdds, fmtPct, fmtSignedPct } from "@/lib/format";

export interface MovementInput {
  status: "scheduled" | "live" | "finished";
  selection: string;
  openingOdds: number;
  currentOdds: number;
  /** currentOdds / openingOdds − 1 (consensus prices). */
  movement: number;
  booksQuoting: number;
  booksMovedSinceOpen: number;
  modelProbability: number | null;
  marketProbability: number;
  openingFavourite: boolean;
}

export const SHARP_RULE = { minMove: 0.08, minBookShare: 0.6 };
export const RLM_RULE = { minDrift: 0.05, minBookShare: 0.6 };

export const SHARP_DEFINITION = `Sharp movement: the consensus price has moved at least ${SHARP_RULE.minMove * 100}% since opening, with at least ${SHARP_RULE.minBookShare * 100}% of quoting bookmakers moving the same way. It describes price behaviour only; the data does not show who placed bets or why.`;
export const RLM_DEFINITION = `Reverse line movement: the selection the public indicators point to has drifted at least ${RLM_RULE.minDrift * 100}% since opening, with at least ${RLM_RULE.minBookShare * 100}% of quoting bookmakers moving the same way. In DEMO_MODE no betting-percentage data exists, so the only public indicator used is favourite status at opening.`;

/** Listed separately from the facts; the system cannot tell which, if any, applies. */
export const MOVEMENT_EXPLANATIONS = ["New information", "Lineup changes", "Injury information", "Bookmaker balancing", "Liquidity", "Market correction"];

export interface MovementSignal {
  kind: "SHARP" | "RLM";
  direction: "shortening" | "drifting";
  facts: string[];
  summary: string;
  bookShare: number;
}

const share = (r: MovementInput) => (r.booksQuoting ? r.booksMovedSinceOpen / r.booksQuoting : 0);

function modelFact(r: MovementInput): string | null {
  if (r.modelProbability === null) return null;
  const rel = r.modelProbability > r.marketProbability ? "above" : r.modelProbability < r.marketProbability ? "below" : "equal to";
  return `The model probability (${fmtPct(r.modelProbability)}) is ${rel} the current implied market probability (${fmtPct(r.marketProbability)}).`;
}

export function sharpMovement(r: MovementInput): MovementSignal | null {
  if (r.status !== "scheduled" || Math.abs(r.movement) < SHARP_RULE.minMove || share(r) < SHARP_RULE.minBookShare) return null;
  const direction = r.movement < 0 ? "shortening" : "drifting";
  const verb = direction === "shortening" ? "shortened" : "lengthened";
  const model = modelFact(r);
  const disagrees = r.modelProbability !== null && (direction === "shortening" ? r.modelProbability > r.marketProbability : r.modelProbability < r.marketProbability);
  return {
    kind: "SHARP",
    direction,
    bookShare: share(r),
    facts: [
      `Opening ${fmtOdds(r.openingOdds)} → current ${fmtOdds(r.currentOdds)} (${fmtSignedPct(r.movement)}).`,
      `${r.booksMovedSinceOpen} of ${r.booksQuoting} tracked bookmakers moved the same way.`,
      ...(model ? [model] : []),
    ],
    summary:
      `Multiple bookmakers have ${verb} ${r.selection}'s price` +
      (r.modelProbability === null ? "." : disagrees ? " while the model probability remains on the other side of the current implied market probability. Potential statistical discrepancy detected." : ", in the same direction as the model's estimate."),
  };
}

export function reverseLineMovement(r: MovementInput): MovementSignal | null {
  if (r.status !== "scheduled" || !r.openingFavourite || r.movement < RLM_RULE.minDrift || share(r) < RLM_RULE.minBookShare) return null;
  const model = modelFact(r);
  return {
    kind: "RLM",
    direction: "drifting",
    bookShare: share(r),
    facts: [
      `Public indicator: ${r.selection} was the favourite at opening (${fmtOdds(r.openingOdds)}).`,
      `Market: price drifted to ${fmtOdds(r.currentOdds)} (${fmtSignedPct(r.movement)}); ${r.booksMovedSinceOpen} of ${r.booksQuoting} bookmakers moved the same way.`,
      ...(model ? [model] : []),
    ],
    summary: "Market movement differs from the direction suggested by the selected public indicators.",
  };
}

export function movementSignals(r: MovementInput): MovementSignal[] {
  return [sharpMovement(r), reverseLineMovement(r)].filter((s): s is MovementSignal => s !== null);
}
