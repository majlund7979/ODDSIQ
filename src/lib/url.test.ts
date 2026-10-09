import { describe, expect, it } from "vitest";
import { lookup, one } from "./url";

describe("one", () => {
  it("keeps a single value and drops repeated or missing ones", () => {
    expect(one("vinder")).toBe("vinder");
    expect(one("")).toBe("");
    expect(one(["abc", "def"])).toBeUndefined();
    expect(one([])).toBeUndefined();
    expect(one(undefined)).toBeUndefined();
  });
});

describe("lookup", () => {
  const table: Record<string, string> = { ok: "Gemt.", fejl: "Ikke gemt." };

  it("finds the table's own keys", () => {
    expect(lookup(table, "ok")).toBe("Gemt.");
    expect(lookup(table, "fejl")).toBe("Ikke gemt.");
  });

  it("finds nothing for inherited names, unknown keys and undefined", () => {
    expect(lookup(table, "__proto__")).toBeUndefined();
    expect(lookup(table, "constructor")).toBeUndefined();
    expect(lookup(table, "toString")).toBeUndefined();
    expect(lookup(table, "hasOwnProperty")).toBeUndefined();
    expect(lookup(table, "lukket")).toBeUndefined();
    expect(lookup(table, undefined)).toBeUndefined();
  });
});
