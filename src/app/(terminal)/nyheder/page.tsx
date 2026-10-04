import Link from "next/link";
import { NewsList } from "@/components/NewsList";
import { requireFriend } from "@/lib/auth/friends";
import { wallClock } from "@/lib/data";
import { leagueNews, NEWS_LEAGUES } from "@/lib/news/news";

export const metadata = { title: "Nyheder · Oddsanalyse" };

export default async function NewsPage({ searchParams }: { searchParams: Promise<{ liga?: string }> }) {
  const now = await wallClock();
  await requireFriend("/nyheder");
  const { liga } = await searchParams;
  const league = NEWS_LEAGUES.find((l) => l.id === liga) ?? NEWS_LEAGUES[0];
  const items = await leagueNews(league, now);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="space-y-2">
        <h1 className="display text-[40px] text-accent sm:text-5xl">Nyheder</h1>
        <p className="text-[15px] text-ink-2">Seneste fodboldnyheder fra ligaerne, vi analyserer. Tryk på en overskrift for at læse hele artiklen.</p>
      </header>
      <nav aria-label="Liga" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
        {NEWS_LEAGUES.map((l) => (
          <Link
            key={l.id}
            href={l.id === "alle" ? "/nyheder" : `/nyheder?liga=${l.id}`}
            scroll={false}
            aria-current={l.id === league.id ? "page" : undefined}
            className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-sm ${l.id === league.id ? "border-lime bg-lime font-semibold text-accent" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink"}`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <section className="overflow-hidden rounded-[20px] border border-line bg-surface">
        {items.length ? (
          <NewsList items={items} now={now} />
        ) : (
          <p className="px-5 py-10 text-center text-sm text-ink-2">Ingen nyheder lige nu. Prøv igen om lidt.</p>
        )}
      </section>
      <p className="text-xs text-muted">Kilde: Google News, opdateres hver halve time. Overskrifter og links går til de oprindelige medier.</p>
    </div>
  );
}
