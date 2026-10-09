// Speed and data check for the live site, run from GitHub Actions ("Diagnose"
// workflow). Times the database and the page data on this server, counts what
// the pages have to show, and asks the statistics feed for this week's
// fixtures. Returns numbers only, never personal data.
// Call with `Authorization: Bearer $CRON_SECRET`.

import { cronAuthorized, lastLine } from "@/lib/auth/cron";
import { DEMO_MODE } from "@/lib/data";
import { db, DATABASE_CONFIGURED } from "@/lib/db";
import { PICK_WINDOW_MS } from "@/lib/picks";
import { AF_ODDS_PLAN, configuredAfOddsFeed, configuredFeed, feedConfig, oddsPlan } from "@/lib/providers/config";
import { readRecordedPicks } from "@/lib/real/pick-records";
import { realSnapshot } from "@/lib/real/store";
import { seasonFor } from "@/lib/stats/api-football";
import { configuredStatsFeed } from "@/lib/stats/config";
import { STATS_LEAGUES } from "@/lib/stats/leagues";
import { refreshPredictions } from "@/lib/stats/af-predictions";
import { loadScoring, refreshScorerForm } from "@/lib/real/scorers";
import { topScorer } from "@/lib/top-scorer";
import { inviteOnly, ownerEmails } from "@/lib/auth/friends";
import { MAIL_CONFIGURED } from "@/lib/mail";
import { clubEloCovers, clubEloLastError, clubEloRatings, findClub } from "@/lib/stats/clubelo";

export const maxDuration = 60;

async function timed<T>(f: () => Promise<T>): Promise<[T, number]> {
  const t = Date.now();
  const r = await f();
  return [r, Date.now() - t];
}

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Whether the Resend key works, without sending anything: Resend answers 401 to a bad key on any endpoint. */
async function mailCheck(): Promise<Record<string, unknown>> {
  const from = process.env.MAIL_FROM || "onboarding@resend.dev";
  const r: Record<string, unknown> = { configured: MAIL_CONFIGURED, senderDomain: /@([^>\s]+)/.exec(from)?.[1] ?? null };
  if (!MAIL_CONFIGURED) return r;
  try {
    const res = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }, cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as { name?: string; message?: string; data?: { name: string; status: string }[] };
    // A sending-only key may not list domains (restricted_api_key); that still proves the key is valid.
    r.resend = res.ok ? { http: res.status, domains: body.data?.map((d) => `${d.name} ${d.status}`) ?? [] } : { http: res.status, error: body.name ?? null, message: body.message?.slice(0, 160) ?? null };
  } catch (e) {
    r.resend = `error ${lastLine(e)}`;
  }
  return r;
}

export async function GET(req: Request): Promise<Response> {
  if (!cronAuthorized(req)) return new Response("Unauthorized.", { status: 401 });
  const now = Date.now();
  const out: Record<string, unknown> = {
    demoMode: DEMO_MODE,
    demoModeSetting: process.env.DEMO_MODE === undefined ? "unset" : JSON.stringify(process.env.DEMO_MODE),
    region: process.env.VERCEL_REGION ?? null,
    // Only the database host's region part (e.g. "eu-central-1"), to match the server region to it.
    dbRegion: /\.([a-z]{2}-[a-z]+-\d)\./.exec(process.env.DATABASE_URL ?? "")?.[1] ?? null,
    oddsKeyConfigured: Boolean(process.env.ODDS_API_KEY),
    statsKeyConfigured: Boolean(process.env.STATS_API_KEY),
    sports: feedConfig().sports,
    // Filled in at the end; listed here so it lands inside the workflow's 12 000-character annotation.
    accounts: null,
    clubElo: null,
    afPredictions: null,
    scorers: null,
  };
  if (!DATABASE_CONFIGURED) return Response.json({ ...out, database: "not configured" });
  const prisma = db();
  try {
    const pings: number[] = [];
    for (let i = 0; i < 3; i++) pings.push((await timed(() => prisma.$queryRaw`SELECT 1`))[1]);
    out.dbPingMs = pings;
    const [light, lightMs] = await timed(() => realSnapshot(prisma, now, { ledger: false, fresh: true }));
    const [, againMs] = await timed(() => realSnapshot(prisma, now, { ledger: false }));
    out.pageDataMs = { cold: lightMs, cached: againMs };
    const soon = light.rows.filter((r) => r.sportId === "football" && r.kickoff > now && r.kickoff <= now + PICK_WINDOW_MS);
    out.counts = {
      upcomingEvents: light.events.length,
      rows: light.rows.length,
      matchesNext24h: new Set(soon.map((r) => r.eventId)).size,
      matchesNext24hWithModel: new Set(soon.filter((r) => r.modelProbability !== null).map((r) => r.eventId)).size,
      leagues: [...new Set(light.rows.map((r) => r.league))],
      lastOddsAt: light.rows.length ? new Date(Math.max(...light.rows.map((r) => r.lastUpdate))).toISOString() : null,
      predictions: await prisma.prediction.count(),
      users: await prisma.user.count(),
      tips: await prisma.tipPick.count(),
      playerStats: await prisma.playerSeasonStat.count(),
      statsFixtures: await prisma.statsFixture.count({ where: { kickoff: { gte: new Date(now - 2 * 86_400_000) } } }),
      eventsByLeague: (await prisma.event.groupBy({ by: ["leagueId"], where: { externalId: { not: null }, kickoff: { gte: new Date(now) } }, _count: true })).map((g) => `${g.leagueId}: ${g._count}`),
    };
    // Login and mail, for "Glemt adgangskode?": counts and yes/no only, never an address.
    const owners = ownerEmails();
    const since = new Date(now - 86_400_000);
    out.accounts = {
      inviteOnly: inviteOnly(),
      ownerEmails: owners.length,
      ownerAccounts: owners.length ? await prisma.user.count({ where: { email: { in: owners } } }) : 0,
      resetLinks24h: await prisma.passwordReset.count({ where: { createdAt: { gte: since } } }),
      resetLinksUsed24h: await prisma.passwordReset.count({ where: { usedAt: { gte: since } } }),
      mail: await mailCheck(),
    };
    out.lastRuns = (await prisma.ingestRun.findMany({ orderBy: { startedAt: "desc" }, take: 6 })).map(
      (r) => `${r.startedAt.toISOString().slice(5, 16)} ${r.provider}/${r.kind} events=${r.events} snaps=${r.snapshots} credits=${r.creditsUsed ?? "?"}/${r.creditsRemaining ?? "?"}${r.error ? ` error=${r.error.slice(0, 120)}` : ""}`,
    );
  } catch (e) {
    out.databaseError = lastLine(e);
  }

  // Upcoming kickoffs per league from the odds feed (free on The Odds API): a scheduled run only buys odds for a
  // league with a kickoff inside the plan window, so this shows why a run fetched nothing.
  const oddsFeed = configuredFeed();
  if (oddsFeed) {
    const windowMs = oddsPlan().windowMs;
    out.oddsUpcoming = await Promise.all(
      feedConfig().sports.map(async (k) => {
        try {
          const t = (await oddsFeed.upcoming(k)).data.filter((x) => x > now).sort((a, b) => a - b);
          return `${k}: ${t.length} upcoming, ${t.filter((x) => x <= now + windowMs).length} inside ${windowMs / 3_600_000} h, next ${t[0] ? new Date(t[0]).toISOString().slice(0, 16) : "none"}`;
        } catch (e) {
          return `${k}: error ${lastLine(e)}`;
        }
      }),
    );
  }

  // The same for the API-Football odds competitions: which have a current season, and their next kickoff.
  const afFeed = configuredAfOddsFeed();
  if (afFeed) {
    try {
      const comps = (await afFeed.competitions()).data;
      // One at a time: API-Football limits requests per minute.
      const lines: string[] = [];
      for (const c of comps) {
        try {
          const t = (await afFeed.upcoming(c.key)).data.sort((a, b) => a - b);
          lines.push(`${c.key} (season ${afFeed.seasons.get(c.key)}): ${t.length} in 3 days, ${t.filter((x) => x <= now + AF_ODDS_PLAN.windowMs).length} inside 48 h, next ${t[0] ? new Date(t[0]).toISOString().slice(0, 16) : "none"}`);
        } catch (e) {
          lines.push(`${c.key}: error ${lastLine(e)}`);
        }
      }
      out.afOddsUpcoming = lines;
    } catch (e) {
      out.afOddsUpcoming = `error ${lastLine(e)}`;
    }
  }

  // One fixtures call for the first covered league this season and the season before, to see what the plan returns.
  const feed = configuredStatsFeed();
  const key = feedConfig().sports.find((k) => STATS_LEAGUES[k] !== undefined);
  if (feed && key) {
    const league = STATS_LEAGUES[key];
    const probe = async (season: number) => {
      try {
        const r = await feed.fixtures(league, season, isoDay(now - 86_400_000), isoDay(now + 3 * 86_400_000));
        return { season, fixtures: r.data.length, first: r.data[0] ? `${r.data[0].home} vs ${r.data[0].away}` : null, left: r.quota.remaining };
      } catch (e) {
        return { season, error: lastLine(e) };
      }
    };
    out.statsProbe = { league: key, from: isoDay(now - 86_400_000), to: isoDay(now + 3 * 86_400_000), results: [await probe(seasonFor(now)), await probe(seasonFor(now) - 1)] };
    // What the provider itself calls the current season, and its next fixtures without a date range.
    type Raw = { http?: number; results?: number | null; errors?: unknown; response: unknown[]; error?: string };
    const raw = async (path: string, params: Record<string, string | number>): Promise<Raw> => {
      try {
        const res = await fetch(`https://v3.football.api-sports.io${path}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`, {
          headers: { "x-apisports-key": process.env.STATS_API_KEY ?? "" },
          cache: "no-store",
        });
        const body = (await res.json()) as { results?: number; errors?: unknown; response?: unknown[] };
        return { http: res.status, results: body.results ?? null, errors: body.errors ?? null, response: body.response ?? [] };
      } catch (e) {
        return { error: lastLine(e), response: [] };
      }
    };
    const leagueInfo = await raw("/leagues", { id: league });
    const seasons = ((leagueInfo.response[0] as { seasons?: { year: number; current: boolean; start: string; end: string }[] } | undefined)?.seasons ?? []);
    const next = await raw("/fixtures", { league, next: 3 });
    out.statsLeague = {
      http: leagueInfo.http ?? null,
      errors: leagueInfo.error ?? leagueInfo.errors ?? null,
      current: seasons.filter((x) => x.current),
      latest: seasons.slice(-2),
    };
    out.statsNext = {
      results: next.results ?? null,
      errors: next.error ?? next.errors ?? null,
      fixtures: next.response.map((f) => {
        const x = f as { fixture?: { date?: string }; league?: { season?: number }; teams?: { home?: { name?: string }; away?: { name?: string } } };
        return `${x.fixture?.date} ${x.teams?.home?.name} vs ${x.teams?.away?.name} (season ${x.league?.season})`;
      }),
    };
  }
  // ClubElo: whether today's ratings load here, and which upcoming club teams find no rating (to add aliases).
  try {
    const clubs = await clubEloRatings(now);
    if (!clubs) out.clubElo = `unreachable: ${clubEloLastError() ?? "?"}`;
    else if (DATABASE_CONFIGURED) {
      const events = await db().event.findMany({ where: { kickoff: { gte: new Date(now), lte: new Date(now + 8 * 86_400_000) } }, select: { leagueId: true, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } } });
      const teams = new Map<string, string>();
      for (const e of events) if (clubEloCovers(e.leagueId)) for (const t of [e.homeTeam.name, e.awayTeam.name]) teams.set(`${e.leagueId}|${t}`, t);
      const unmatched = [...teams].filter(([k, t]) => !findClub(t, k.split("|")[0], clubs.ratings)).map(([k]) => k);
      out.clubElo = { clubs: clubs.ratings.length, date: isoDay(clubs.date), teams: teams.size, unmatched: unmatched.slice(0, 60) };
    }
  } catch (e) {
    out.clubElo = `error ${lastLine(e)}`;
  }
  // API-Football /predictions: fetches up to three due matches (so a run shows the live answer), then what is stored.
  try {
    const key = process.env.STATS_API_KEY;
    if (DATABASE_CONFIGURED && key) {
      const run = await refreshPredictions(db(), { apiKey: key, now, maxRequests: 3 });
      const stored = await db().fixturePrediction.findMany({ orderBy: { fetchedAt: "desc" }, take: 200 });
      const usable = stored.filter((r) => !(r.data as { empty?: boolean }).empty);
      const last = usable[0]?.data as { fixtureId?: number; percent?: unknown; comparison?: unknown[] } | undefined;
      out.afPredictions = { run, stored: stored.length, usable: usable.length, latest: last ? { fixtureId: last.fixtureId, percent: last.percent, comparisonKeys: last.comparison?.length ?? 0 } : null };
    } else out.afPredictions = "no STATS_API_KEY or database";
  } catch (e) {
    out.afPredictions = `error ${lastLine(e)}`;
  }
  // Top scorers for the goal lines: fetches a couple of teams' last matches, then how many upcoming matches have both teams' numbers.
  try {
    const feed = configuredStatsFeed();
    if (DATABASE_CONFIGURED && feed) {
      const run = await refreshScorerForm(db(), feed, now, 6);
      const events = await db().event.findMany({ where: { sportId: "football", status: "scheduled", kickoff: { gt: new Date(now), lte: new Date(now + 86_400_000) } }, select: { id: true } });
      const scoring = await loadScoring(db(), events.map((e) => e.id), now);
      const tops = [...scoring.values()].map((s) => [topScorer(s.home.players, s.home.recent, { injuries: [], lineup: null }), topScorer(s.away.players, s.away.recent, { injuries: [], lineup: null })]);
      out.scorers = {
        run,
        matches24h: events.length,
        withSquads: scoring.size,
        withBothScorers: tops.filter(([h, a]) => h && a).length,
        withForm: tops.filter(([h, a]) => h?.recent && a?.recent).length,
        sample: tops.flat().filter(Boolean).slice(0, 4).map((t) => `${t!.name} ${t!.goals}g form ${t!.recent ? t!.recent.ratio.toFixed(2) : "-"}`),
      };
    } else out.scorers = "no STATS_API_KEY or database";
  } catch (e) {
    out.scorers = `error ${lastLine(e)}`;
  }
  // Lineups for matches around kickoff: whether each is matched to an API-Football fixture and has lineups stored.
  try {
    const near = await prisma.event.findMany({
      where: { kickoff: { gte: new Date(now - 30 * 60_000), lte: new Date(now + 3 * 3_600_000) } },
      orderBy: { kickoff: "asc" },
      take: 25,
      include: { homeTeam: true, awayTeam: true, statsFixtures: { include: { lineups: { select: { side: true } } } } },
    });
    const lineupsNear = near.map((e) => {
      const fx = e.statsFixtures.map((f) => `${f.id} lineupsAt=${f.lineupsAt?.toISOString().slice(11, 16) ?? "-"} sides=${f.lineups.length}`).join(" | ") || "no fixture";
      return `${e.kickoff.toISOString().slice(11, 16)} ${e.id} ${e.homeTeam.name}-${e.awayTeam.name} confirmed=${e.lineupConfirmedAt?.toISOString().slice(11, 16) ?? "-"} ${fx}`;
    });
    const visit = await prisma.playerStatsSync.findUnique({ where: { id: "lineups:visit" } });
    const resultsVisit = await prisma.playerStatsSync.findUnique({ where: { id: "results:visit" } });
    // The "Ramte, sidste 7 dage" tile: every recorded "bedste" pick of the last week and how it settled.
    const week = (await readRecordedPicks(prisma, now, 7)).filter((p) => p.category === "bedste");
    const settled = week.filter((p) => p.result);
    const picksWeek = {
      recorded: week.length,
      settled: settled.length,
      won: settled.filter((p) => p.result === "won").length,
      open: week.length - settled.length,
      rows: week.map((p) => `${p.day} ${p.match} | ${p.outcome} ${Math.round(p.probability * 100)}% ${p.odds ?? "-"} → ${p.result ?? "uafgjort"}`),
    };
    return Response.json({ picksWeek, resultsVisitAt: resultsVisit?.fetchedAt.toISOString() ?? null, lineupsVisitAt: visit?.fetchedAt.toISOString() ?? null, lineupsNear, ...out });
  } catch (e) {
    out.lineupsError = lastLine(e);
  }
  return Response.json(out);
}
