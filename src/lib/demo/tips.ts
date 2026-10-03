// Demo tipping game (DEMO DATA): the demo friends tip on the demo matches,
// seeded by friend and match so the table is stable.

import { modelPick, SIDES, weekOf, type Tip, type TipMatch } from "@/lib/tips";
import { Rng } from "./rng";

const FRIENDS = [
  { id: "demo-1", name: "Jonas", share: 0.8, bold: 0.15 },
  { id: "demo-2", name: "Sofie", share: 0.6, bold: 0.35 },
  { id: "demo-3", name: "Emil", share: 0.9, bold: 0.25 },
  { id: "demo-4", name: "Laura", share: 0.5, bold: 0.1 },
];

export function demoTips(matches: TipMatch[]): Tip[] {
  const out: Tip[] = [];
  for (const m of matches)
    for (const f of FRIENDS) {
      const rng = new Rng(`tip:${f.id}:${m.eventId}`);
      if (!rng.chance(f.share)) continue;
      const fav = modelPick(m.model) ?? "home";
      const pick = rng.chance(f.bold) ? SIDES.filter((s) => s !== fav)[rng.chance(0.5) ? 0 : 1] : fav;
      out.push({ userId: f.id, name: f.name, eventId: m.eventId, week: weekOf(m.kickoff).id, kickoff: m.kickoff, home: m.home, away: m.away, pick, odds: m.odds[pick], modelPick: modelPick(m.model), result: m.result });
    }
  return out.sort((a, b) => b.kickoff - a.kickoff);
}
