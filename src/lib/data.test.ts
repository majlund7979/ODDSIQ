import { describe, expect, it } from "vitest";
import { demoModeFrom } from "./data";

describe("DEMO_MODE", () => {
  it("accepts the usual ways of writing false", () => {
    for (const v of ["false", "False", " FALSE ", '"false"', "'false'", "0", "no", "off", "nej"]) expect(demoModeFrom({ DEMO_MODE: v })).toBe(false);
    for (const v of ["true", "True", "1", "yes"]) expect(demoModeFrom({ DEMO_MODE: v, DATABASE_URL: "x", ODDS_API_KEY: "y" })).toBe(true);
  });

  it("goes live by itself when unset and the database and odds feed are configured", () => {
    expect(demoModeFrom({})).toBe(true);
    expect(demoModeFrom({ DATABASE_URL: "x" })).toBe(true);
    expect(demoModeFrom({ DATABASE_URL: "x", ODDS_API_KEY: "y" })).toBe(false);
    expect(demoModeFrom({ DEMO_MODE: "", DATABASE_URL: "x", ODDS_API_KEY: "y" })).toBe(false);
  });
});
