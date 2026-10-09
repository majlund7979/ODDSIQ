// The bet types on /picks: the menu's order and groups, the tabs whose list
// comes from picks-extra, and the link to a tab.

import type { MarketRow } from "@/lib/demo/store";
import { CATEGORY_LABEL, TAB_EXTRA_LABEL } from "@/lib/pick-categories";
import type { PickContext } from "@/lib/picks";
import { correctScorePicks, doubleChancePicks, halfTimePicks, type ExtraPick } from "@/lib/picks-extra";

/** The bet types in menu order; HitRates and TAB_GROUPS follow it. */
export const TABS = [
  { id: "bedste", label: CATEGORY_LABEL.bedste },
  { id: "vinder", label: CATEGORY_LABEL.vinder },
  { id: "dobbelt", label: CATEGORY_LABEL.dobbelt },
  { id: "maal15", label: CATEGORY_LABEL.maal15 },
  { id: "maal", label: CATEGORY_LABEL.maal },
  { id: "btts", label: CATEGORY_LABEL.btts },
  { id: "resultat", label: CATEGORY_LABEL.resultat },
  { id: "halvleg", label: CATEGORY_LABEL.halvleg },
  { id: "skud", label: TAB_EXTRA_LABEL.skud },
  { id: "hjorne", label: CATEGORY_LABEL.hjorne },
  { id: "kort", label: CATEGORY_LABEL.kort },
  { id: "frispark", label: CATEGORY_LABEL.frispark },
  { id: "straffe", label: TAB_EXTRA_LABEL.straffe },
] as const satisfies readonly { id: string; label: string }[];

export type TabId = (typeof TABS)[number]["id"];

/** The tab with this id; Bedste bets for anything else, such as a mistyped ?type=. */
export function tabFor(id: string | undefined) {
  return TABS.find((x) => x.id === id) ?? TABS[0];
}

/** The bet types, grouped so the menu reads like a list rather than a wall of buttons. */
export const TAB_GROUPS = (
  [
    { title: "Kampen", ids: ["bedste", "vinder", "dobbelt", "resultat"] },
    { title: "Mål", ids: ["maal15", "maal", "btts", "halvleg"] },
    { title: "Spillere", ids: ["skud"] },
    { title: "Statistik", ids: ["hjorne", "kort", "frispark", "straffe"] },
  ] satisfies { title: string; ids: TabId[] }[]
).map((g) => ({ ...g, tabs: g.ids.map(tabFor) }));

type ExtraFn = (rows: MarketRow[], now: number, count: number, context: (eventId: string) => PickContext | null) => ExtraPick[];

/** The tabs whose list comes from picks-extra. */
export const EXTRA: Partial<Record<TabId, ExtraFn>> = {
  dobbelt: doubleChancePicks,
  resultat: correctScorePicks,
  halvleg: halfTimePicks,
};

/** The link to a bet type and number of bets; the defaults (Bedste bets, 10) are left out. */
export function picksHref(type: TabId, n: number) {
  const qs = new URLSearchParams({ ...(type !== "bedste" ? { type } : {}), ...(n !== 10 ? { antal: String(n) } : {}) }).toString();
  return qs ? `/picks?${qs}` : "/picks";
}
