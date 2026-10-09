import { describe, expect, it } from "vitest";
import { capitalize, clock, dateDa, dayKey, dec, krFromUnits, pct, pctOrDash, pctTight, shortDate, signedPct, TZ } from "./format";

describe("Danish numbers", () => {
  it("uses a decimal comma", () => {
    expect(dec(1.5)).toBe("1,50");
    expect(dec(2.25, 1)).toBe("2,3");
    expect(dec(3, 0)).toBe("3");
  });

  it("rounds percentages and keeps the space before %", () => {
    expect(pct(0.567)).toBe("57 %");
    expect(pct(0)).toBe("0 %");
    expect(pctOrDash(0.567)).toBe("57 %");
    expect(pctOrDash(NaN)).toBe("—");
    expect(pctOrDash(Infinity)).toBe("—");
    expect(pctTight(0.567)).toBe("57%");
  });

  it("signs percentages with a real minus", () => {
    expect(signedPct(-0.034)).toBe("−3,4 %");
    expect(signedPct(0)).toBe("+0,0 %");
    expect(signedPct(0.1234, 2)).toBe("+12,34 %");
  });

  it("turns units staked at 100 kr into kroner", () => {
    expect(krFromUnits(-0.5)).toBe("−50 kr");
    expect(krFromUnits(0)).toBe("+0 kr");
    expect(krFromUnits(1.234)).toBe("+123 kr");
  });
});

describe("Copenhagen dates", () => {
  it("shows the clock and short date in Danish time", () => {
    expect(clock(Date.UTC(2026, 9, 8, 15, 30))).toBe("17.30");
    expect(clock(Date.UTC(2026, 9, 8, 22, 5))).toBe("00.05");
    expect(clock(Date.UTC(2026, 0, 8, 23, 59))).toBe("00.59");
    expect(shortDate(Date.UTC(2026, 9, 8, 15, 30))).toBe("8. okt.");
    expect(shortDate(Date.UTC(2026, 9, 31, 23, 30))).toBe("1. nov.");
  });

  it("writes a full date with the year in Danish", () => {
    expect(dateDa(Date.UTC(2026, 9, 8, 15, 30))).toBe("8. okt. 2026");
    expect(dateDa(Date.UTC(2026, 11, 31, 23, 30))).toBe("1. jan. 2027");
    expect(dateDa(Date.UTC(2027, 4, 1, 12))).toBe("1. maj 2027");
  });

  it("gives the same day key as toLocaleDateString, across both clock changes", () => {
    const old = (t: number) => new Date(t).toLocaleDateString("en-CA", { timeZone: TZ });
    const samples: number[] = [];
    // Every 5 minutes around midnight and the clock changes on 29 March and 25 October 2026.
    for (const start of [Date.UTC(2026, 2, 28, 20), Date.UTC(2026, 9, 24, 20)]) for (let m = 0; m < 12 * 60; m += 5) samples.push(start + m * 60_000);
    // The rest spread over two years at an uneven step.
    while (samples.length < 10_000) samples.push(Date.UTC(2025, 0, 1) + samples.length * 7_013_000);
    expect(dayKey(Date.UTC(2026, 9, 8, 22, 30))).toBe("2026-10-09");
    for (const t of samples) expect(dayKey(t)).toBe(old(t));
  });

  it("capitalises the first letter", () => {
    expect(capitalize("torsdag 8. oktober")).toBe("Torsdag 8. oktober");
    expect(capitalize("ø")).toBe("Ø");
    expect(capitalize("")).toBe("");
  });
});
