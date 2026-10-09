// Live scores for the picks whose matches are being played. One API-Football
// call (all fixtures of the day) serves every visitor for a minute, so the
// cost is at most one request a minute while someone has the page open.
// Each pick is matched to its fixture by id (API-Football events) or by
// kickoff and team names (The Odds API events).

import type { PrismaClient } from "@/generated/prisma/client";
import { matchTeam } from "@/lib/model/teams";
import { recordedCategory } from "@/lib/pick-categories";
import { settle } from "@/lib/picks-extra";
import { apiFootballGet } from "@/lib/stats/api-football";

const MIN = 60_000;
/** A pick counts as live from kickoff until this long after. */
export const LIVE_WINDOW_MS = 150 * MIN;
const CACHE_MS = MIN;
/** API-Football gets this long for a day's fixtures, retries included, so a slow answer never holds up the picks page. */
const DEADLINE_MS = 3000;
const FINISHED = new Set(["FT", "AET", "PEN"]);
const NOT_STARTED = new Set(["TBD", "NS", "PST", "CANC", "ABD", "AWD", "WO"]);

export interface LiveFixture {
  id: string;
  home: string;
  away: string;
  kickoff: number;
  /** API-Football short status: 1H, HT, 2H, ET, P, FT … */
  status: string;
  minute: number | null;
  goals: [number, number] | null;
}

export interface LivePick {
  key: string;
  match: string;
  league: string;
  outcome: string;
  /** "62'", "Pause" or "Slut". */
  clock: string;
  score: [number, number] | null;
  /** How the bet stands on the current score; null when the score cannot settle it (corners, cards, half-time …). */
  state: "won" | "lost" | null;
  /** How the bet looks right now, for the coloured marker (see liveTone). */
  tone: LiveTone;
  finished: boolean;
}

/**
 * won: settled or can no longer lose · winning: would win if it ended now · neutral: level, e.g. 0-0 on a winner bet ·
 * behind: worse than level (the other team leads, or goals are missing) · lost: settled or can no longer win ·
 * unknown: the score cannot tell (corners, cards …).
 */
export type LiveTone = "won" | "winning" | "neutral" | "behind" | "lost" | "unknown";

/** The marker for a bet on the current score (Mads, 2026-10-05). Pure. */
export function liveTone(spec: string, score: [number, number] | null, finished: boolean): LiveTone {
  const [kind, a, b] = spec.split(":");
  if (!["1X2", "OU", "BTTS", "DC"].includes(kind)) return "unknown";
  if (!score) return "neutral";
  const [h, w] = score;
  const res = settle(spec, { goals: score, ht: null, corners: null, cards: null, fouls: null });
  if (finished) return res === "won" ? "won" : res === "lost" ? "lost" : "unknown";
  if (kind === "OU") {
    const line = Number(b);
    const total = h + w;
    if (a === "over") {
      if (total > line) return "won";
      return Math.ceil(line) - total <= 1 ? "neutral" : "behind";
    }
    if (total > line) return "lost";
    return "winning";
  }
  if (kind === "BTTS") {
    const both = h > 0 && w > 0;
    if (a === "yes") return both ? "won" : "neutral";
    return both ? "lost" : h + w === 0 ? "winning" : "neutral";
  }
  if (kind === "1X2") {
    if (a === "draw") return h === w ? "winning" : "behind";
    const lead = a === "home" ? h - w : w - h;
    return lead > 0 ? "winning" : lead === 0 ? "neutral" : "behind";
  }
  // Double chance: 1X, X2 or 12.
  if (a === "12") return h !== w ? "winning" : "neutral";
  return res === "won" ? "winning" : "behind";
}

interface ApiFixture {
  fixture: { id: number; timestamp: number; status: { short: string; elapsed: number | null } };
  teams: { home: { name: string }; away: { name: string } };
  goals: { home: number | null; away: number | null };
}

export function normalizeFixtures(rows: ApiFixture[]): LiveFixture[] {
  return rows.map((r) => ({
    id: String(r.fixture.id),
    home: r.teams.home.name,
    away: r.teams.away.name,
    kickoff: r.fixture.timestamp * 1000,
    status: r.fixture.status.short,
    minute: r.fixture.status.elapsed,
    goals: r.goals.home === null || r.goals.away === null ? null : [r.goals.home, r.goals.away],
  }));
}

const cache = new Map<string, { at: number; fixtures: LiveFixture[] }>();
const pending = new Map<string, Promise<LiveFixture[]>>();

/** All fixtures of one UTC day ("2026-10-04"), cached for a minute; callers at the same time share one request. */
export async function dayFixtures(apiKey: string, day: string, now: number, fetchImpl?: typeof fetch): Promise<LiveFixture[]> {
  const hit = cache.get(day);
  if (hit && now - hit.at < CACHE_MS) return hit.fixtures;
  let request = pending.get(day);
  if (!request) {
    request = fetchDay(apiKey, day, now, fetchImpl).finally(() => pending.delete(day));
    pending.set(day, request);
  }
  return request;
}

async function fetchDay(apiKey: string, day: string, now: number, fetchImpl?: typeof fetch): Promise<LiveFixture[]> {
  const signal = AbortSignal.timeout(DEADLINE_MS);
  const get = fetchImpl ?? fetch;
  const { body } = await apiFootballGet<ApiFixture>("/fixtures", { date: day }, { apiKey, fetchImpl: (url, init) => get(url, { ...init, signal }), wait: async () => {} });
  const fixtures = normalizeFixtures(body.response);
  cache.set(day, { at: now, fixtures });
  for (const [d, v] of cache) if (now - v.at > 10 * CACHE_MS) cache.delete(d);
  return fixtures;
}

/** The fixture for a pick: by id for "apf-<id>" events, else by kickoff (±20 min) and both team names. */
export function findFixture(p: { eventId: string; home: string; away: string; kickoff: number }, fixtures: LiveFixture[]): LiveFixture | null {
  if (p.eventId.startsWith("apf-")) return fixtures.find((f) => f.id === p.eventId.slice(4)) ?? null;
  return fixtures.find((f) => Math.abs(f.kickoff - p.kickoff) <= 20 * MIN && matchTeam(p.home, [f.home]) && matchTeam(p.away, [f.away])) ?? null;
}

export function liveState(spec: string, f: LiveFixture): Pick<LivePick, "clock" | "score" | "state" | "tone" | "finished"> {
  const finished = FINISHED.has(f.status);
  const clock = finished ? "Slut" : f.status === "HT" ? "Pause" : f.minute !== null ? `${f.minute}'` : f.status;
  const state = f.goals ? settle(spec, { goals: f.goals, ht: null, corners: null, cards: null, fouls: null }) : null;
  return { clock, score: f.goals, state, tone: liveTone(spec, f.goals, finished), finished };
}

/** Recorded picks of one bet type whose matches kicked off within the live window, with their live score. */
export async function livePicks(prisma: PrismaClient, apiKey: string | null, category: string, now: number): Promise<LivePick[]> {
  if (!apiKey) return [];
  const rows = await prisma.pickRecord.findMany({ where: { category: recordedCategory(category), kickoff: { gte: new Date(now - LIVE_WINDOW_MS), lte: new Date(now) } }, orderBy: { kickoff: "asc" } });
  if (!rows.length) return [];
  // A late kickoff can still be playing after midnight UTC, so fetch every day the picks started on.
  const days = [...new Set(rows.map((r) => r.kickoff.toISOString().slice(0, 10)))];
  const fixtures = (await Promise.all(days.map((d) => dayFixtures(apiKey, d, now)))).flat();
  return rows.flatMap((r) => {
    const f = findFixture({ eventId: r.eventId, home: r.home, away: r.away, kickoff: r.kickoff.getTime() }, fixtures);
    if (!f || NOT_STARTED.has(f.status)) return [];
    return [{ key: `${r.eventId}|${r.category}`, match: `${r.home} vs ${r.away}`, league: r.leagueName, outcome: r.outcome, ...liveState(r.spec, f) }];
  });
}
