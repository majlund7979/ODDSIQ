// Demo friends' league (DEMO DATA): four made-up friends who each saved some of
// the recorded demo picks. Seeded by pick, so the table is stable.

import type { FriendBet } from "@/lib/friends";
import { demoRecordedPicks } from "./picks";
import { Rng } from "./rng";

const FRIENDS = [
  { id: "demo-1", name: "Jonas", share: 0.18, stake: 100 },
  { id: "demo-2", name: "Sofie", share: 0.12, stake: 50 },
  { id: "demo-3", name: "Emil", share: 0.22, stake: 75 },
  { id: "demo-4", name: "Laura", share: 0.1, stake: 150 },
];

export function demoFriendBets(now: number): FriendBet[] {
  const picks = demoRecordedPicks(now);
  const out: FriendBet[] = [];
  for (const f of FRIENDS)
    for (const p of picks) {
      const rng = new Rng(`friend:${f.id}:${p.match}:${p.category}`);
      if (!rng.chance(f.share)) continue;
      // Without a bookmaker price, the friend "got" a little under our fair odds.
      const odds = p.odds ?? Math.round((0.95 / p.probability) * 100) / 100;
      out.push({
        id: `${f.id}:${p.match}:${p.category}`,
        userId: f.id,
        name: f.name,
        kickoff: p.kickoff,
        league: p.league,
        match: p.match,
        category: p.category,
        outcome: p.outcome,
        probability: p.probability,
        odds: odds > 1.01 ? odds : null,
        stake: f.stake,
        result: p.result,
      });
    }
  return out.sort((a, b) => b.kickoff - a.kickoff);
}
