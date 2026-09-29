import { describe, expect, it } from "vitest";
import { movementSignals, reverseLineMovement, sharpMovement, type MovementInput } from "./signals";

const base: MovementInput = {
  status: "scheduled",
  selection: "Arsenal",
  openingOdds: 2.15,
  currentOdds: 1.89,
  movement: 1.89 / 2.15 - 1,
  booksQuoting: 10,
  booksMovedSinceOpen: 8,
  modelProbability: 0.58,
  marketProbability: 0.529,
  openingFavourite: false,
};

describe("movement signals", () => {
  it("flags broad shortening and notes the model is still above the market", () => {
    const s = sharpMovement(base)!;
    expect(s.direction).toBe("shortening");
    expect(s.summary).toContain("Potential statistical discrepancy");
    expect(s.facts.join(" ")).toContain("8 of 10");
  });

  it("requires size, breadth and a pre-match market", () => {
    expect(sharpMovement({ ...base, booksMovedSinceOpen: 5 })).toBeNull();
    expect(sharpMovement({ ...base, movement: -0.05 })).toBeNull();
    expect(sharpMovement({ ...base, status: "live" })).toBeNull();
  });

  it("flags a drifting opening favourite as reverse line movement", () => {
    const rlm = reverseLineMovement({ ...base, openingFavourite: true, openingOdds: 1.8, currentOdds: 1.92, movement: 1.92 / 1.8 - 1 });
    expect(rlm?.summary).toBe("Market movement differs from the direction suggested by the selected public indicators.");
    expect(reverseLineMovement({ ...base, openingFavourite: false, movement: 0.07 })).toBeNull();
  });

  it("never claims a cause", () => {
    const text = movementSignals({ ...base, openingFavourite: true, movement: 0.09, currentOdds: 2.35 })
      .flatMap((s) => [s.summary, ...s.facts])
      .join(" ")
      .toLowerCase();
    expect(text).not.toMatch(/sharp bettors|professional|because|caused/);
  });
});
