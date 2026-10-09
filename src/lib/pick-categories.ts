import { SHARP_VERSION } from "@/lib/sharp";

/** Danish names of the bet types, keyed by the category each recorded pick counts under (shownCategory). */
export const CATEGORY_LABEL: Record<string, string> = {
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
};

/** Bet types on /picks that are never recorded, so they stay out of CATEGORY_LABEL, whose keys the results board lists. */
export const TAB_EXTRA_LABEL = { skud: "Skud på mål", straffe: "Straffespark" };

/**
 * Dagens bedste bets has followed three rules: the most probable bet, then the prediction engine's value bets
 * (2026-10-06), then the Pinnacle price comparison (sharp.ts). Its picks are recorded under an id that names the
 * rule, so the results board, the learning and the live scores for "bedste" only count the current rule's bets.
 */
export const BEDSTE_RECORD = `bedste-${SHARP_VERSION}`;
/** Earlier rules' "bedste" picks: kept in the database, shown nowhere. */
const BEDSTE_EARLIER = "bedste-tidligere";

/** The category a pick is recorded under. */
export const recordedCategory = (category: string) => (category === "bedste" ? BEDSTE_RECORD : category);
/** The category a recorded pick counts under. */
export const shownCategory = (recorded: string) => (recorded === BEDSTE_RECORD ? "bedste" : recorded === "bedste" ? BEDSTE_EARLIER : recorded);
