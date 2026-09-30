import Link from "next/link";
import { MarketReplay } from "@/components/MarketReplay";
import { LinkTabs, PageHeader, Panel } from "@/components/ui";
import { requestNow } from "@/lib/data";
import { SPORTS } from "@/lib/demo/catalog";
import { replayableEvents, replayData } from "@/lib/demo/store";
import { fmtDate, fmtTime } from "@/lib/format";

export const metadata = { title: "Market Replay · ODDSIQ" };

const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);

export default async function MarketReplayPage({ searchParams }: { searchParams: Promise<{ sport?: string; league?: string; date?: string; event?: string }> }) {
  const now = await requestNow();
  const q = await searchParams;
  const events = replayableEvents(now);
  const picked = q.event ? events.find((e) => e.id === q.event) : undefined;

  const sport = picked?.sportId ?? SPORTS.find((s) => s.id === q.sport)?.id ?? "football";
  const inSport = events.filter((e) => e.sportId === sport);
  const leagues = [...new Map(inSport.map((e) => [e.leagueId, e.leagueName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const league = picked?.leagueId ?? (leagues.some(([id]) => id === q.league) ? q.league! : "all");
  const inLeague = league === "all" ? inSport : inSport.filter((e) => e.leagueId === league);
  const days = [...new Set(inLeague.map((e) => dayOf(e.kickoff)))].slice(0, 10);
  const date = picked ? dayOf(picked.kickoff) : days.includes(q.date ?? "") ? q.date! : days[0];
  const matches = inLeague.filter((e) => dayOf(e.kickoff) === date).sort((a, b) => a.kickoff - b.kickoff);
  const eventId = picked?.id ?? matches.find((e) => e.id.startsWith("live-"))?.id ?? matches[0]?.id;
  const data = eventId ? replayData(eventId, now) : undefined;

  const href = (p: { sport?: string; league?: string; date?: string; event?: string }) => {
    const s = new URLSearchParams();
    s.set("sport", p.sport ?? sport);
    if ((p.league ?? league) !== "all") s.set("league", p.league ?? league);
    if (p.date) s.set("date", p.date);
    if (p.event) s.set("event", p.event);
    return `/market-replay?${s}`;
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Market Replay" subtitle="Pick a finished match and replay its main market from opening to full time: price movement, news and lineups, the model's recorded prediction, match events, closing odds, result and closing line value." />

      <Panel>
        <div className="space-y-2 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-14 text-[10.5px] uppercase tracking-wider text-muted">Sport</span>
            <LinkTabs label="Sport" active={sport} items={SPORTS.map((s) => ({ id: s.id, label: s.name, href: `/market-replay?sport=${s.id}` }))} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-14 text-[10.5px] uppercase tracking-wider text-muted">League</span>
            <LinkTabs label="League" active={league} items={[{ id: "all", label: "All", href: `/market-replay?sport=${sport}` }, ...leagues.map(([id, name]) => ({ id, label: name, href: href({ league: id }) }))]} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-14 text-[10.5px] uppercase tracking-wider text-muted">Date</span>
            <LinkTabs label="Date" active={date ?? ""} items={days.map((d) => ({ id: d, label: fmtDate(Date.parse(d)), href: href({ date: d }) }))} />
          </div>
          <div className="flex flex-wrap items-start gap-3">
            <span className="w-14 pt-1 text-[10.5px] uppercase tracking-wider text-muted">Match</span>
            <div className="flex flex-1 flex-wrap gap-1">
              {matches.length === 0 && <span className="py-1 text-xs text-muted">No finished matches in the last 60 days for this choice.</span>}
              {matches.map((e) => (
                <Link
                  key={e.id}
                  href={href({ date, event: e.id })}
                  scroll={false}
                  aria-current={e.id === eventId ? "page" : undefined}
                  className={`rounded px-2 py-1 text-xs ${e.id === eventId ? "bg-surface-3 text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}
                >
                  <span className="num text-muted">{fmtTime(e.kickoff)}</span> {e.homeName} {e.score?.home}–{e.score?.away} {e.awayName}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      {data ? (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">
              {data.view.event.homeName} <span className="num">{data.view.event.score?.home}–{data.view.event.score?.away}</span> {data.view.event.awayName}
              <span className="ml-3 text-xs font-normal text-muted">
                {data.view.event.sportName} · {data.view.event.leagueName} · {fmtDate(data.view.event.kickoff)} {fmtTime(data.view.event.kickoff)} UTC
              </span>
            </h2>
          </div>
          {data.frames.length - 1 === data.kickoffIndex && <p className="text-xs text-muted">In-play data is simulated for football only in DEMO_MODE, so this replay stops at kickoff and then shows the result.</p>}
          <MarketReplay key={data.view.event.id} data={data} />
        </>
      ) : (
        <Panel>
          <p className="px-4 py-10 text-center text-sm text-muted">Choose a match to replay.</p>
        </Panel>
      )}
    </div>
  );
}
