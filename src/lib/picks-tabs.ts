// The bet types on /picks: the menu's order and groups, the tabs whose list
// comes from picks-extra, and the link to a tab.

import { COUNT_CATEGORIES } from "@/lib/picks";
import { correctScorePicks, doubleChancePicks, halfTimePicks, type ExtraPick } from "@/lib/picks-extra";

export const EXTRA: Record<string, (rows: Parameters<typeof doubleChancePicks>[0], now: number, n: number, ctx: Parameters<typeof doubleChancePicks>[3]) => ExtraPick[]> = {
  dobbelt: doubleChancePicks,
  resultat: correctScorePicks,
  halvleg: halfTimePicks,
};

export const TABS = [
  { id: "bedste", label: "Bedste bets" },
  { id: "vinder", label: "Hvem vinder" },
  { id: "dobbelt", label: "Dobbeltchance" },
  { id: "maal15", label: "Over/under 1,5 mål" },
  { id: "maal", label: "Over/under 2,5 mål" },
  { id: "btts", label: "Begge hold scorer" },
  { id: "resultat", label: "Korrekt resultat" },
  { id: "halvleg", label: "1. halvleg" },
  { id: "skud", label: "Skud på mål" },
  ...COUNT_CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
  { id: "straffe", label: "Straffespark" },
];

/** The bet types, grouped so the menu reads like a list rather than a wall of buttons. */
export const TAB_GROUPS = [
  { title: "Kampen", ids: ["bedste", "vinder", "dobbelt", "resultat"] },
  { title: "Mål", ids: ["maal15", "maal", "btts", "halvleg"] },
  { title: "Spillere", ids: ["skud"] },
  { title: "Statistik", ids: [...COUNT_CATEGORIES.map((c) => c.id), "straffe"] },
].map((g) => ({ ...g, tabs: g.ids.map((id) => TABS.find((x) => x.id === id)!).filter(Boolean) }));

/** The link to a bet type and number of bets; the defaults (Bedste bets, 10) are left out. */
export function picksHref(type: string, n: number) {
  const qs = new URLSearchParams({ ...(type !== "bedste" ? { type } : {}), ...(n !== 10 ? { antal: String(n) } : {}) }).toString();
  return qs ? `/picks?${qs}` : "/picks";
}
