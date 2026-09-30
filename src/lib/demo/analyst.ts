// AI Analyst question routing. Questions are mapped to fixed analyses over the
// terminal's own data; anything that does not map gets an honest "can't answer"
// rather than a guess.

import { TEAMS } from "./catalog";

export type AnalystIntent =
  | { kind: "team"; teamId: string }
  | { kind: "compare"; a: string; b: string }
  | { kind: "report" }
  | { kind: "watchlist" }
  | { kind: "movers" }
  | { kind: "disagreement" }
  | { kind: "unknown"; text: string };

export const ANALYST_EXAMPLES = ["analyze Arsenal", "compare Liverpool Chelsea", "Where does the model disagree most with the market?", "Which prices moved most?", "weekly report", "Anything interesting in my watchlist?"];

type NamedTeam = { id: string; name: string };
const byLength = (teams: NamedTeam[]) => [...teams].sort((a, b) => b.name.length - a.name.length);
const demoTeams = byLength(TEAMS);

/** Team names mentioned in the text, longest names first so "Manchester United" beats "Manchester". */
export function teamsIn(text: string, teams: NamedTeam[] = demoTeams): string[] {
  let rest = ` ${text.toLowerCase()} `;
  const found: { id: string; at: number }[] = [];
  for (const t of teams === demoTeams ? teams : byLength(teams)) {
    const name = t.name.toLowerCase();
    const at = rest.indexOf(name);
    if (at >= 0) {
      found.push({ id: t.id, at });
      rest = rest.slice(0, at) + " ".repeat(name.length) + rest.slice(at + name.length);
    }
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.id);
}

export function parseQuestion(q: string, knownTeams: NamedTeam[] = demoTeams): AnalystIntent | null {
  const text = q.trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  const teams = teamsIn(text, knownTeams);
  if (teams.length >= 2 && /(compare|vs\.?|versus|against|or)\b/.test(lower)) return { kind: "compare", a: teams[0], b: teams[1] };
  if (teams.length >= 1) return { kind: "team", teamId: teams[0] };
  if (/(report|weekly|this week)/.test(lower)) return { kind: "report" };
  if (/watchlist|my (teams|markets|matches)/.test(lower)) return { kind: "watchlist" };
  if (/(moved|movement|moving|shorten|drift)/.test(lower)) return { kind: "movers" };
  if (/(disagree|edge|differ|discrepanc|value)/.test(lower)) return { kind: "disagreement" };
  return { kind: "unknown", text };
}
