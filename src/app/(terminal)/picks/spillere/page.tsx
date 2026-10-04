import Link from "next/link";
import { requireFriend } from "@/lib/auth/friends";
import { DEMO_MODE } from "@/lib/data";
import { db } from "@/lib/db";
import { demoTeams, demoTeamSquad } from "@/lib/demo/team-search";
import { POSITION_LABEL } from "@/lib/player-shots";
import { searchTeams, teamSquad, type TeamSquad } from "@/lib/real/team-search";
import { API_FOOTBALL, seasonFor, type TeamHit } from "@/lib/stats/api-football";
import { configuredStatsFeed } from "@/lib/stats/config";
import { cleanQuery, LEADER_CATEGORIES, PER90_MIN_MINUTES, RECENT_MATCHES, teamLeaders, type Leader } from "@/lib/team-leaders";
import { terminal } from "@/lib/terminal";

export const metadata = { title: "Holdsøgning · Oddsanalyse" };
// A team that has not been opened today is fetched from API-Football on the spot (up to about 10 requests).
export const maxDuration = 60;

const TZ = "Europe/Copenhagen";
const dec = (x: number) => x.toFixed(2).replace(".", ",");
const day = (t: number) => new Date(t).toLocaleDateString("da-DK", { day: "numeric", month: "short", timeZone: TZ });
const clock = (t: number) => new Date(t).toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ, hour12: false });
const seasonLabel = (s: number) => `${s}/${String((s + 1) % 100).padStart(2, "0")}`;
const min = (m: number) => `${m.toLocaleString("da-DK")} min`;

function Form({ f }: { f: Leader["form"] }) {
  if (f === "over") return <span className="whitespace-nowrap rounded-full bg-good/15 px-1.5 py-0.5 text-[10px] font-semibold text-good">↑ over snit</span>;
  if (f === "under") return <span className="whitespace-nowrap rounded-full bg-serious/15 px-1.5 py-0.5 text-[10px] font-semibold text-serious">↓ under snit</span>;
  if (f === "same") return <span className="whitespace-nowrap rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] font-semibold text-ink-2">= som snit</span>;
  return <span className="text-[10px] text-muted">—</span>;
}

function CategoryCard({ label, short, leaders }: { label: string; short: string; leaders: Leader[] }) {
  return (
    <section className="overflow-hidden rounded-[20px] border border-line bg-surface">
      <div className="flex items-baseline gap-2 border-b border-line px-4 py-3">
        <span className="rounded-full bg-lime px-2 py-0.5 text-[11px] font-bold text-accent">{short}</span>
        <h2 className="font-bold">{label}</h2>
      </div>
      {leaders.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-2">Ingen spillere med tal i den kategori endnu.</p>
      ) : (
        <ol className="divide-y divide-line">
          <li className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-1.5 text-[10px] text-muted">
            <span>Spiller · spilletid</span>
            <span className="w-[4.5rem] text-right">Sæson</span>
            <span className="w-24 text-right">Sidste {RECENT_MATCHES}</span>
          </li>
          {leaders.map((l, i) => (
            <li key={l.playerId} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2.5">
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="num w-4 shrink-0 text-xs text-muted">{i + 1}</span>
                  <span className="truncate text-sm font-semibold">{l.name}</span>
                </span>
                <span className="block truncate pl-6 text-[11px] text-muted">
                  {l.position ? `${POSITION_LABEL[l.position] ?? l.position} · ` : ""}
                  {min(l.minutes)} i {l.appearances} kampe
                </span>
              </span>
              <span className="w-[4.5rem] text-right">
                <span className="num block text-lg font-bold leading-tight">{l.value}</span>
                <span className="num block whitespace-nowrap text-[10px] text-muted">{l.per90 === null ? "få min." : `${dec(l.per90)} pr. 90`}</span>
              </span>
              <span className="w-24 text-right">
                {l.recent ? (
                  <>
                    <span className="num block text-sm font-semibold leading-tight">
                      {l.recent.value} <span className="text-[10px] font-normal text-muted">på {min(l.recent.minutes)}</span>
                    </span>
                    <span className="mt-0.5 block">
                      <Form f={l.form} />
                    </span>
                  </>
                ) : (
                  <span className="text-[11px] text-muted">ikke spillet</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

interface TeamLink {
  key: string;
  name: string;
  sub?: string;
}

export default async function TeamSearchPage({ searchParams }: { searchParams: Promise<{ q?: string; hold?: string; navn?: string }> }) {
  await requireFriend("/picks/spillere");
  const q = await searchParams;
  const query = cleanQuery(q.q);
  const t = await terminal();
  const feed = DEMO_MODE ? null : configuredStatsFeed();

  // Search hits, or teams playing in the next two days when nothing is searched.
  let links: TeamLink[] = [];
  if (DEMO_MODE) {
    const all = demoTeams(t.marketRows());
    links = (query ? all.filter((n) => n.toLowerCase().includes(query.toLowerCase())) : all.slice(0, 12)).map((n) => ({ key: n, name: n }));
  } else if (query) {
    const hits: TeamHit[] = await searchTeams(db(), feed, query, t.now);
    links = hits.map((h) => ({ key: String(h.id), name: h.name, sub: h.national ? "Landshold" : (h.country ?? undefined) }));
  } else {
    const soon = await db().statsFixture.findMany({
      where: { provider: API_FOOTBALL, eventId: { not: null }, kickoff: { gte: new Date(t.now), lte: new Date(t.now + 2 * 86_400_000) } },
      orderBy: { kickoff: "asc" },
      take: 30,
    });
    const seen = new Map<string, TeamLink>();
    for (const f of soon)
      for (const [id, name] of [[f.homeTeamId, f.home], [f.awayTeamId, f.away]] as const) if (id && !seen.has(String(id))) seen.set(String(id), { key: String(id), name, sub: `spiller ${clock(f.kickoff.getTime())}` });
    links = [...seen.values()].slice(0, 16);
  }

  // The chosen team.
  let squad: (Pick<TeamSquad, "players" | "recent" | "recentKickoffs"> & Partial<TeamSquad>) | null = null;
  const teamName = (q.navn ?? q.hold ?? "").slice(0, 60);
  if (q.hold) {
    if (DEMO_MODE) squad = { ...demoTeamSquad(q.hold, t.now), season: seasonFor(t.now), competitions: 1, fetchedAt: t.now, error: null };
    else if (/^\d{1,9}$/.test(q.hold)) squad = await teamSquad(db(), feed, Number(q.hold), t.now);
  }
  const leaders = squad ? teamLeaders(squad.players, squad.recent) : null;
  const season = squad?.season ?? seasonFor(t.now);
  const href = (l: TeamLink) => `/picks/spillere?hold=${encodeURIComponent(l.key)}&navn=${encodeURIComponent(l.name)}${query ? `&q=${encodeURIComponent(query)}` : ""}`;
  const source = DEMO_MODE ? "DEMO DATA" : "API-Football";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-5 rounded-[28px] border border-line bg-gradient-to-br from-accent/15 to-surface px-4 py-5 sm:px-10 sm:py-8">
        <Link href="/picks" className="text-sm text-muted hover:text-ink">
          ← Dagens bedste bets
        </Link>
        <div>
          <h1 className="display text-[40px] text-ink sm:text-5xl">Holdsøgning</h1>
          <p className="mt-2 max-w-2xl text-[15px] text-ink-2">
            Søg et hold og se de spillere, der laver flest skud på mål, mål, assists og frispark. Hver spiller har sæsonen, de sidste {RECENT_MATCHES} kampe og om formen er over eller under spillerens eget snit.
          </p>
        </div>
        <form action="/picks/spillere" className="flex max-w-xl gap-2">
          <input
            name="q"
            defaultValue={q.q ?? ""}
            placeholder="Fx Brøndby, Liverpool eller Danmark"
            aria-label="Holdnavn"
            minLength={3}
            className="min-w-0 flex-1 rounded-full border border-line-strong bg-surface-2 px-4 py-2.5 text-[15px] outline-none placeholder:text-muted focus:border-accent"
          />
          <button type="submit" className="rounded-full bg-accent px-5 py-2.5 text-[15px] font-semibold text-white hover:brightness-110">
            Søg
          </button>
        </form>
        {q.q && !query && <p className="text-sm text-warning">Skriv mindst 3 bogstaver.</p>}
        {links.length > 0 ? (
          <div>
            <div className="mb-2 text-xs font-medium text-muted">{query ? `Hold der matcher "${query}"` : DEMO_MODE ? "Hold i demo-kampene" : "Hold der spiller de næste 2 dage"}</div>
            <div className="flex flex-wrap gap-2">
              {links.map((l) => (
                <Link
                  key={l.key}
                  href={href(l)}
                  aria-current={l.key === q.hold ? "page" : undefined}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${l.key === q.hold ? "border-lime bg-lime text-accent" : "border-line bg-surface text-ink-2 hover:border-accent hover:text-ink"}`}
                >
                  {l.name}
                  {l.sub && <span className="ml-1.5 text-xs text-muted">{l.sub}</span>}
                </Link>
              ))}
            </div>
          </div>
        ) : (
          query && <p className="text-sm text-ink-2">Ingen hold fundet. Prøv holdets navn på engelsk, fx &quot;Denmark&quot; eller &quot;Copenhagen&quot;.</p>
        )}
      </header>

      {squad && leaders && (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="display text-3xl">{teamName || "Holdet"}</h2>
            <span className="text-xs text-muted">
              Historisk · sæson {seasonLabel(season)} · {new Set(squad.players.map((p) => p.playerId)).size} spillere · {squad.competitions ?? 1} {squad.competitions === 1 ? "turnering" : "turneringer"}
              {squad.recentKickoffs.length > 0 && ` · sidste ${squad.recentKickoffs.length} kampe ${day(squad.recentKickoffs.at(-1)!)}–${day(squad.recentKickoffs[0])}`} · {source}
              {squad.fetchedAt ? ` · hentet ${clock(squad.fetchedAt)}` : ""}
            </span>
          </div>
          {squad.players.length === 0 ? (
            <div className="rounded-[20px] bg-surface-2 px-6 py-10 text-center text-sm text-ink-2">
              {squad.error ? "Spillertallene kunne ikke hentes lige nu. Prøv igen om lidt." : "Der er ingen spillertal for holdet i denne eller sidste sæson."}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {LEADER_CATEGORIES.map((c) => (
                <CategoryCard key={c.id} label={c.label} short={c.short} leaders={leaders[c.id]} />
              ))}
            </div>
          )}
          <p className="text-xs leading-relaxed text-muted">
            Sæson er summen over alle turneringer holdet har spillet i sæsonen. &quot;Sidste {RECENT_MATCHES}&quot; er hvad spilleren lavede i holdets seneste {RECENT_MATCHES} kampe, og på hvor mange minutter. Over eller under snit sammenligner de sidste kampe pr. 90 minutter med spillerens eget sæsonsnit pr. 90 (±20 %). Pr. 90 vises først fra {PER90_MIN_MINUTES} minutter. Kilde: {source}. Tallene er historiske og siger ikke, hvad der sker i næste kamp.
          </p>
        </>
      )}
    </div>
  );
}
