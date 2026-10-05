// API-Football's own view of a match (/predictions): home/draw/away percentages
// and a home-vs-away comparison of form, attack, defence, goals and head-to-head,
// built from the teams' matches in every competition, so it compares clubs across
// leagues. Used where our results model has no data (Champions League, Europa
// League, Superliga): the analysis shows the comparison, and on 1X2 its
// percentages get a minority share next to the market (estimated, af-predictions-v1).
// One call per match, fetched on page visits a day or two before kickoff.

import type { PrismaClient } from "@/generated/prisma/client";
import { apiFootballGet } from "./api-football";
import { claimSlot } from "./lineups";

export const AF_PREDICTION_SOURCE = "API-Football /predictions";
export const AF_PREDICTION_MODEL = "af-predictions-v1";
/** Share of the 1X2 probability taken from API-Football's percentages on market-only matches; the rest is the market's. */
export const AF_PREDICTION_WEIGHT = 0.25;
/** API-Football rounds to coarse numbers and sometimes says 0 %; no outcome goes below this before the blend. */
export const AF_PREDICTION_FLOOR = 0.05;

const MIN = 60_000;
const HOUR = 60 * MIN;
/** Fetch for matches kicking off within this window… */
export const AF_PREDICTION_LOOKAHEAD_MS = 48 * HOUR;
/** …and again when the stored one is older than this. */
export const AF_PREDICTION_STALE_MS = 12 * HOUR;
/** One visit per interval does the fetching, with at most this many calls. */
export const AF_PREDICTION_VISIT_INTERVAL_MS = 20 * MIN;
export const AF_PREDICTION_MAX_REQUESTS = 15;

export const COMPARISON_KEYS = ["form", "att", "def", "poisson_distribution", "h2h", "goals", "total"] as const;
export type ComparisonKey = (typeof COMPARISON_KEYS)[number];
export const COMPARISON_LABELS: Record<ComparisonKey, string> = {
  form: "Form",
  att: "Angreb",
  def: "Forsvar",
  poisson_distribution: "Målmodel",
  h2h: "Indbyrdes",
  goals: "Mål",
  total: "Samlet",
};

export interface AfPrediction {
  fixtureId: number;
  /** Home, draw and away as fractions summing to 1. */
  percent: { home: number; draw: number; away: number };
  /** Each side's share per comparison (home + away = 1); only the keys API-Football sent. */
  comparison: { key: ComparisonKey; home: number; away: number }[];
  advice: string | null;
  winner: string | null;
  fetchedAt: number;
  /** "DEMO DATA" in demo mode. */
  source: string;
}

interface RawPair {
  home?: string | number | null;
  away?: string | number | null;
}
export interface RawPrediction {
  predictions?: { winner?: { name?: string | null } | null; advice?: string | null; percent?: { home?: string; draw?: string; away?: string } | null } | null;
  comparison?: Partial<Record<string, RawPair>> | null;
}

/** "45%" → 0.45; null when it is not a number. */
const share = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace("%", "").trim());
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n / 100 : null;
};

/** API-Football's response for one fixture → our shape; null without usable percentages. */
export function normalizePrediction(fixtureId: number, raw: RawPrediction, fetchedAt: number, source = AF_PREDICTION_SOURCE): AfPrediction | null {
  const p = raw.predictions?.percent;
  const [h, d, a] = [share(p?.home), share(p?.draw), share(p?.away)];
  if (h === null || d === null || a === null || h + d + a <= 0) return null;
  const sum = h + d + a;
  const comparison: AfPrediction["comparison"] = [];
  for (const key of COMPARISON_KEYS) {
    const c = raw.comparison?.[key];
    const [ch, ca] = [share(c?.home), share(c?.away)];
    if (ch === null || ca === null || ch + ca <= 0) continue;
    comparison.push({ key, home: ch / (ch + ca), away: ca / (ch + ca) });
  }
  return {
    fixtureId,
    percent: { home: h / sum, draw: d / sum, away: a / sum },
    comparison,
    advice: raw.predictions?.advice?.trim() || null,
    winner: raw.predictions?.winner?.name?.trim() || null,
    fetchedAt,
    source,
  };
}

/** The percentages with every outcome at least the floor, renormalised: the input to the 1X2 blend. */
export function flooredPercent(p: AfPrediction["percent"], floor = AF_PREDICTION_FLOOR): AfPrediction["percent"] {
  const f = { home: Math.max(floor, p.home), draw: Math.max(floor, p.draw), away: Math.max(floor, p.away) };
  const s = f.home + f.draw + f.away;
  return { home: f.home / s, draw: f.draw / s, away: f.away / s };
}

/** API-Football's fixture id for one of our matches: from an "apf-" event id, else from its matched stats fixture ("api-football:<id>"). */
export function fixtureIdOf(eventId: string, statsFixtureId?: string | null): number | null {
  const m = /^apf-(\d+)$/.exec(eventId) ?? /^api-football:(\d+)$/.exec(statsFixtureId ?? "");
  return m ? Number(m[1]) : null;
}

export interface PredictionRefreshSummary {
  due: number;
  fetched: number;
  requests: number;
  error: string | null;
}

/** Upcoming football matches with no stored prediction, or a stale one, soonest first. */
export async function predictionsDue(prisma: PrismaClient, now: number): Promise<{ fixtureId: number; kickoff: number }[]> {
  const events = await prisma.event.findMany({
    where: { sportId: "football", status: "scheduled", kickoff: { gt: new Date(now), lte: new Date(now + AF_PREDICTION_LOOKAHEAD_MS) } },
    select: { id: true, kickoff: true, statsFixtures: { select: { id: true }, where: { provider: "api-football" }, take: 1 } },
    orderBy: { kickoff: "asc" },
  });
  const ids = new Map<number, number>();
  for (const e of events) {
    const id = fixtureIdOf(e.id, e.statsFixtures[0]?.id);
    if (id !== null && !ids.has(id)) ids.set(id, e.kickoff.getTime());
  }
  if (!ids.size) return [];
  const fresh = await prisma.fixturePrediction.findMany({
    where: { fixtureId: { in: [...ids.keys()] }, fetchedAt: { gt: new Date(now - AF_PREDICTION_STALE_MS) } },
    select: { fixtureId: true },
  });
  for (const f of fresh) ids.delete(f.fixtureId);
  return [...ids].map(([fixtureId, kickoff]) => ({ fixtureId, kickoff }));
}

export async function refreshPredictions(
  prisma: PrismaClient,
  opts: { apiKey: string; now: number; maxRequests?: number; fetchImpl?: typeof fetch; wait?: (ms: number) => Promise<void> },
): Promise<PredictionRefreshSummary> {
  const due = await predictionsDue(prisma, opts.now);
  const s: PredictionRefreshSummary = { due: due.length, fetched: 0, requests: 0, error: null };
  try {
    for (const { fixtureId } of due.slice(0, opts.maxRequests ?? AF_PREDICTION_MAX_REQUESTS)) {
      const { body } = await apiFootballGet<RawPrediction>("/predictions", { fixture: fixtureId }, opts);
      s.requests++;
      const p = body.response?.[0] ? normalizePrediction(fixtureId, body.response[0], opts.now) : null;
      // Also stored when empty, so a match API-Football has nothing for is not asked again until it is stale.
      const data = (p ?? { fixtureId, empty: true }) as object;
      await prisma.fixturePrediction.upsert({ where: { fixtureId }, create: { fixtureId, fetchedAt: new Date(opts.now), data }, update: { fetchedAt: new Date(opts.now), data } });
      if (p) s.fetched++;
    }
  } catch (e) {
    s.error = e instanceof Error ? e.message.trim().split("\n").at(-1)! : String(e);
  }
  return s;
}

/** Called after a page visit: one visit per interval fetches; null when another visit had the slot or there is no key. */
export async function refreshPredictionsOnVisit(prisma: PrismaClient, apiKey: string | null | undefined, now = Date.now()): Promise<PredictionRefreshSummary | null> {
  if (!apiKey || !(await claimSlot(prisma, "predictions:visit", AF_PREDICTION_VISIT_INTERVAL_MS, now))) return null;
  return refreshPredictions(prisma, { apiKey, now });
}

/** Stored predictions for these fixtures, by fixture id; empty answers are left out. */
export async function loadPredictions(prisma: PrismaClient, fixtureIds: number[]): Promise<Map<number, AfPrediction>> {
  if (!fixtureIds.length) return new Map();
  const rows = await prisma.fixturePrediction.findMany({ where: { fixtureId: { in: fixtureIds } } });
  const out = new Map<number, AfPrediction>();
  for (const r of rows) {
    const d = r.data as unknown as AfPrediction & { empty?: boolean };
    if (!d.empty && d.percent) out.set(r.fixtureId, d);
  }
  return out;
}
