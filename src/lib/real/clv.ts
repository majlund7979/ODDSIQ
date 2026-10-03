// Closing line value for recorded picks: how the odds we showed compare with
// the market's last prices before kickoff. CLV = shown odds × margin-free
// closing probability − 1, so a positive number means the price we showed
// beat the closing market. Only bets with a stored bookmaker market qualify.

import type { PrismaClient } from "@/generated/prisma/client";
import { closingLine, type PricePoint } from "@/lib/providers/closing";

export const CLV_VERSION = "clv-v1";

/** The full market a bet belongs to, and which of its selections the bet covers (double chance covers two 1X2 outcomes). */
export function specSelections(eventId: string, spec: string): { ids: string[]; covers: number[]; quoted: string | null } | null {
  const [kind, a, b] = spec.split(":");
  const sel = (m: string, s: string) => `${eventId}-${m}-${s}`;
  if (kind === "1X2" && ["home", "draw", "away"].includes(a)) {
    const ids = ["home", "draw", "away"].map((s) => sel("1x2", s));
    return { ids, covers: [ids.indexOf(sel("1x2", a))], quoted: sel("1x2", a) };
  }
  if (kind === "OU" && b === "2.5" && (a === "over" || a === "under")) return { ids: [sel("ou25", "over"), sel("ou25", "under")], covers: [a === "over" ? 0 : 1], quoted: sel("ou25", a) };
  if (kind === "BTTS" && (a === "yes" || a === "no")) return { ids: [sel("btts", "yes"), sel("btts", "no")], covers: [a === "yes" ? 0 : 1], quoted: sel("btts", a) };
  if (kind === "DC" && ["1X", "X2", "12"].includes(a)) {
    const ids = ["home", "draw", "away"].map((s) => sel("1x2", s));
    return { ids, covers: a === "1X" ? [0, 1] : a === "X2" ? [1, 2] : [0, 2], quoted: sel("dc", a.toLowerCase()) };
  }
  return null;
}

export interface Close {
  /** Median closing odds for the bet itself, when bookmakers quoted it. */
  odds: number | null;
  /** Margin-free closing probability of the bet. */
  probability: number;
  books: number;
  /** Shown odds × closing probability − 1. */
  clv: number;
}

export function closeFor(points: PricePoint[], spec: { ids: string[]; covers: number[]; quoted: string | null }, kickoff: number, shownOdds: number): Close | null {
  const line = closingLine(points, spec.ids, kickoff);
  if (!line) return null;
  const probability = spec.covers.reduce((s, i) => s + line.selections[i].fairProbability, 0);
  const own = spec.quoted && spec.ids.includes(spec.quoted) ? line.selections[spec.ids.indexOf(spec.quoted)].medianOdds : spec.quoted ? (closingLine(points, [spec.quoted], kickoff)?.selections[0].medianOdds ?? null) : null;
  return { odds: own, probability, books: line.books, clv: shownOdds * probability - 1 };
}

interface Row {
  eventId: string;
  kickoff: Date;
  spec: string;
  odds: number | null;
}

/** Closing line for each row with odds, in row order; null where the market has no close. */
export async function closes(prisma: PrismaClient, rows: Row[]): Promise<(Close | null)[]> {
  const specs = rows.map((r) => (r.odds ? specSelections(r.eventId, r.spec) : null));
  const ids = [...new Set(specs.flatMap((s) => (s ? [...s.ids, ...(s.quoted ? [s.quoted] : [])] : [])))];
  if (!ids.length) return rows.map(() => null);
  const snaps = await prisma.oddsSnapshot.findMany({ where: { selectionId: { in: ids } }, select: { selectionId: true, bookmakerId: true, observedAt: true, odds: true } });
  const bySel = new Map<string, PricePoint[]>();
  for (const s of snaps) {
    const list = bySel.get(s.selectionId) ?? [];
    list.push({ selectionId: s.selectionId, bookmakerId: s.bookmakerId, observedAt: s.observedAt.getTime(), odds: Number(s.odds) });
    bySel.set(s.selectionId, list);
  }
  return rows.map((r, i) => {
    const s = specs[i];
    if (!s || !r.odds) return null;
    const points = [...s.ids, ...(s.quoted && !s.ids.includes(s.quoted) ? [s.quoted] : [])].flatMap((id) => bySel.get(id) ?? []);
    return closeFor(points, s, r.kickoff.getTime(), r.odds);
  });
}
