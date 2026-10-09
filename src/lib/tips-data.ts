// Loads the tipping game for a page: the matches the page shows and every stored tip
// (plus the demo friends' tips in demo mode). Shared by /tips and Vennerligaen.

import { ACCOUNTS_ENABLED } from "@/lib/auth/session";
import { DEMO_MODE } from "@/lib/data";
import { db } from "@/lib/db";
import { demoTips } from "@/lib/demo/tips";
import { readTips } from "@/lib/real/tips";
import type { Terminal } from "@/lib/terminal";
import { MODEL_ID, MODEL_NAME, modelTips, weekMatches, type Tip, type TipMatch } from "@/lib/tips";

/** `settle: false` skips settling older tips, for a page that shows no standings (/tips). */
export async function loadTips(t: Terminal, { settle = true }: { settle?: boolean } = {}): Promise<{ all: TipMatch[]; tips: Tip[]; source: string }> {
  const all = weekMatches(t.marketRows(), { start: -Infinity, end: Infinity });
  const known = new Map(all.map((m) => [m.eventId, m.result]));
  const stored = ACCOUNTS_ENABLED ? await readTips(db(), t.now, known, { settle }) : [];
  const tips = DEMO_MODE ? [...demoTips(all), ...stored] : stored;
  const source = DEMO_MODE ? "DEMO DATA" : `vennernes egne tips, afgjort med kampresultater fra ${t.dataLabel}`;
  return { all, tips, source };
}

/** Model tips for a week: from the page's matches, plus the model's stored pick on older matches the page no longer shows. */
export function modelWeekTips(all: TipMatch[], tips: Tip[], week: { id: string; start: number; end: number }): Tip[] {
  const out = modelTips(all.filter((m) => m.kickoff >= week.start && m.kickoff < week.end), week.id);
  const seen = new Set(out.map((t) => t.eventId));
  for (const t of tips)
    if (t.week === week.id && t.modelPick && !seen.has(t.eventId)) {
      seen.add(t.eventId);
      out.push({ ...t, userId: MODEL_ID, name: MODEL_NAME, pick: t.modelPick, odds: t.modelPick === t.pick ? t.odds : null });
    }
  return out;
}
