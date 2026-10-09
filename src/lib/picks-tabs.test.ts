import { describe, expect, it } from "vitest";
import { CATEGORY_LABEL } from "./pick-categories";
import { COUNT_CATEGORIES, GOAL_CATEGORIES } from "./picks";
import { EXTRA, picksHref, tabFor, TAB_GROUPS, TABS } from "./picks-tabs";

describe("bet-type tabs", () => {
  it("keeps the menu's ids, names and order", () => {
    expect(TABS).toEqual([
      { id: "bedste", label: "Bedste bets" },
      { id: "vinder", label: "Hvem vinder" },
      { id: "dobbelt", label: "Dobbeltchance" },
      { id: "maal15", label: "Over/under 1,5 mål" },
      { id: "maal", label: "Over/under 2,5 mål" },
      { id: "btts", label: "Begge hold scorer" },
      { id: "resultat", label: "Korrekt resultat" },
      { id: "halvleg", label: "1. halvleg" },
      { id: "skud", label: "Skud på mål" },
      { id: "hjorne", label: "Hjørnespark" },
      { id: "kort", label: "Kort" },
      { id: "frispark", label: "Frispark" },
      { id: "straffe", label: "Straffespark" },
    ]);
  });

  it("puts every tab in exactly one group, in the listed order", () => {
    for (const g of TAB_GROUPS) expect(g.tabs.map((x) => x.id)).toEqual(g.ids);
    const grouped = TAB_GROUPS.flatMap((g) => g.ids);
    expect([...grouped].sort()).toEqual(TABS.map((x) => x.id).sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it("names the goal and count bet types as the results board does", () => {
    for (const c of [...GOAL_CATEGORIES, ...COUNT_CATEGORIES]) expect(c.label).toBe(CATEGORY_LABEL[c.id]);
    for (const c of COUNT_CATEGORIES) expect(TABS.some((x) => x.id === c.id)).toBe(true);
  });

  it("leaves the results board's bet types and names unchanged", () => {
    expect(CATEGORY_LABEL).toEqual({
      bedste: "Bedste bets",
      vinder: "Hvem vinder",
      dobbelt: "Dobbeltchance",
      maal15: "Over/under 1,5 mål",
      maal: "Over/under 2,5 mål",
      btts: "Begge hold scorer",
      resultat: "Korrekt resultat",
      halvleg: "1. halvleg",
      hjorne: "Hjørnespark",
      kort: "Kort",
      frispark: "Frispark",
    });
  });

  it("reads the tab from the URL, Bedste bets for anything else", () => {
    expect(tabFor("skud").id).toBe("skud");
    expect(tabFor(undefined).id).toBe("bedste");
    expect(tabFor("findes-ikke").id).toBe("bedste");
    expect(tabFor("__proto__").id).toBe("bedste");
  });

  it("builds the tab links without the defaults", () => {
    expect(picksHref("bedste", 10)).toBe("/picks");
    expect(picksHref("vinder", 10)).toBe("/picks?type=vinder");
    expect(picksHref("bedste", 5)).toBe("/picks?antal=5");
    expect(picksHref("kort", 5)).toBe("/picks?type=kort&antal=5");
  });

  it("has a picks-extra list for double chance, correct score and first half only", () => {
    expect(Object.keys(EXTRA).sort()).toEqual(["dobbelt", "halvleg", "resultat"]);
  });
});
