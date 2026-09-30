// Settled feed markets for Market Efficiency: every finished feed event with a
// result, its margin-free consensus at each horizon before kickoff and each
// bookmaker's own closing probability. Prices arrive once per feed run, so the
// probability at a horizon is the latest consensus at or before that time, or
// the opening consensus when the horizon falls before the first price.

import type { PrismaClient } from "@/generated/prisma/client";
import type { SportId } from "@/lib/domain/types";
import { HORIZON_HOURS, type SettledSelection } from "@/lib/demo/store";
import { closingLine, type PricePoint } from "@/lib/providers/closing";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** A book's price counts toward a horizon for this long after it was observed (runs are six hours apart). */
const WINDOW_MS = 12 * HOUR;
const LOOKBACK_MS = 365 * DAY;
const CACHE_MS = 10 * 60_000;
const SPORT_NAMES: Record<string, string> = { football: "Football", basketball: "Basketball", tennis: "Tennis", "american-football": "American Football", "ice-hockey": "Ice Hockey" };

let cache: { key: number; rows: SettledSelection[]; books: { id: string; name: string }[] } | null = null;

export async function realSettledSelections(prisma: PrismaClient, now: number): Promise<{ rows: SettledSelection[]; books: { id: string; name: string }[] }> {
  const key = Math.floor(now / CACHE_MS);
  if (cache?.key === key) return cache;
  const events = await prisma.event.findMany({
    where: { externalId: { not: null }, status: "finished", kickoff: { gte: new Date(now - LOOKBACK_MS), lte: new Date(now) } },
    include: { league: true, markets: { include: { selections: { orderBy: { id: "asc" }, include: { snapshots: true } } } } },
  });
  const rows: SettledSelection[] = [];
  const bookIds = new Set<string>();
  const side = (id: string) => id.slice(id.lastIndexOf("-") + 1);
  const order = (id: string) => ["home", "draw", "away", "over", "under", "yes", "no"].indexOf(side(id));
  for (const e of events) {
    const k = e.kickoff.getTime();
    for (const m of e.markets) {
      const sels = [...m.selections].sort((a, b) => order(a.id) - order(b.id));
      if (!sels.every((s) => s.result === "won" || s.result === "lost" || s.result === "void")) continue;
      const ids = sels.map((s) => s.id);
      const points: PricePoint[] = sels.flatMap((s) => s.snapshots.map((p) => ({ selectionId: s.id, bookmakerId: p.bookmakerId, observedAt: p.observedAt.getTime(), odds: Number(p.odds) })));
      const runs = [...new Set(points.map((p) => p.observedAt))].filter((t) => t <= k).sort((a, b) => a - b);
      if (!runs.length) continue;
      const lineAt = (t: number) => closingLine(points, ids, runs.filter((r) => r <= t).at(-1) ?? runs[0], WINDOW_MS);
      const open = lineAt(runs[0]);
      const close = lineAt(k);
      if (!open || !close) continue;
      const horizons = HORIZON_HOURS.map((h) => lineAt(k - h * HOUR) ?? open);

      // Each bookmaker's last complete set of prices at or before kickoff.
      const books: { bookmakerId: string; probs: number[]; margin: number }[] = [];
      for (const b of new Set(points.map((p) => p.bookmakerId))) {
        const prices = ids.map((id) => points.filter((p) => p.bookmakerId === b && p.selectionId === id && p.observedAt <= k && k - p.observedAt <= WINDOW_MS).sort((x, y) => y.observedAt - x.observedAt)[0]?.odds);
        if (prices.some((o) => o === undefined)) continue;
        const implied = prices.map((o) => 1 / o!);
        const total = implied.reduce((a, c) => a + c, 0);
        books.push({ bookmakerId: b, probs: implied.map((x) => x / total), margin: total - 1 });
        bookIds.add(b);
      }

      sels.forEach((s, i) => {
        if (s.result !== "won" && s.result !== "lost") return;
        rows.push({
          selectionId: s.id,
          sportId: e.sportId as SportId,
          leagueId: e.leagueId,
          sportName: SPORT_NAMES[e.sportId] ?? e.sportId,
          leagueName: e.league.name,
          marketType: m.type as SettledSelection["marketType"],
          marketName: m.name,
          kickoff: k,
          won: s.result === "won" ? 1 : 0,
          openingOdds: open.selections[i].medianOdds,
          closingOdds: close.selections[i].medianOdds,
          horizons: horizons.map((l) => l.selections[i].fairProbability),
          books: books.map((b) => ({ bookmakerId: b.bookmakerId, probability: b.probs[i], margin: b.margin })),
        });
      });
    }
  }
  const books = (await prisma.bookmaker.findMany({ where: { id: { in: [...bookIds] } } })).map((b) => ({ id: b.id, name: b.name }));
  cache = { key, rows, books };
  return cache;
}
