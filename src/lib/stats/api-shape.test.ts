import { describe, expect, it } from "vitest";
import { describeShape } from "./api-shape";

describe("describeShape", () => {
  it("collapses arrays, counts filled values and keeps one example", () => {
    const shape = describeShape({ response: [{ team: { id: 1, name: "A" }, xg: null }, { team: { id: 2, name: "B" }, xg: "1.4" }], empty: [] });
    expect(shape["response[].team.id"]).toEqual({ type: "number", filled: 1, example: "1" });
    expect(shape["response[].xg"]).toEqual({ type: "null|string", filled: 0.5, example: "1.4" });
    expect(shape["empty"]).toEqual({ type: "[]", filled: 0 });
  });
});
