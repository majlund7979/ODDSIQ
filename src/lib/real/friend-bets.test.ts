import { describe, expect, it } from "vitest";
import { DEMO_SHARP_BOOKS, demoPickContext } from "@/lib/demo/picks";
import { feedTime, marketRows } from "@/lib/demo/store";
import { memoContext } from "@/lib/picks";
import { allPickDrafts } from "@/lib/picks-extra";
import type { Terminal } from "@/lib/terminal";
import { findDraft, findDrafts } from "./friend-bets";

const NOW = Date.parse("2026-10-08T15:30:00Z");
const t: Terminal = {
  live: false,
  now: NOW,
  feedTime: feedTime(NOW),
  dataLabel: "DEMO DATA",
  marketRows: () => marketRows(NOW),
  ledgerRows: async () => [],
  pickContext: memoContext((id) => demoPickContext(id, NOW)),
  sharpBooks: DEMO_SHARP_BOOKS,
  recordedPicks: async () => [],
};

describe("finding the page's picks again", () => {
  it("finds every coupon leg from one list, as one search per leg would", () => {
    const drafts = allPickDrafts(t.marketRows(), t.now, 50, t.pickContext, t.sharpBooks);
    const categories = [...new Set(drafts.map((d) => d.category))];
    expect(categories.length).toBeGreaterThan(5);
    const legs = [
      ...categories.map((category) => ({ eventId: drafts.find((d) => d.category === category)!.row.eventId, category })),
      { eventId: drafts[0].row.eventId, category: "" },
      { eventId: "no-such-match", category: categories[0] },
      { eventId: drafts.at(-1)!.row.eventId, category: "kupon" },
    ];
    const one = (l: { eventId: string; category: string }) => drafts.find((d) => d.row.eventId === l.eventId && d.category === l.category) ?? null;
    const found = findDrafts(t, legs);
    expect(found).toEqual(legs.map(one));
    expect(found.filter(Boolean)).toHaveLength(categories.length);
    for (const l of legs.slice(0, 3)) expect(findDraft(t, l.eventId, l.category)).toEqual(one(l));
  });
});
