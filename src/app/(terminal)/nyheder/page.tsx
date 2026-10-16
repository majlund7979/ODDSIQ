import Link from "next/link";
import { chipClass, EmptyState, PageHeader } from "@/components/ui";
import { NewsList } from "@/components/NewsList";
import { requireFriend } from "@/lib/auth/friends";
import { wallClock } from "@/lib/data";
import { leagueNews, NEWS_LEAGUES, NEWS_TOPICS } from "@/lib/news/news";

export const metadata = { title: "Nyheder · Oddsanalyse" };

export default async function NewsPage({ searchParams }: { searchParams: Promise<{ liga?: string; emne?: string }> }) {
  const now = await wallClock();
  await requireFriend("/nyheder");
  const { liga, emne } = await searchParams;
  const league = NEWS_LEAGUES.find((l) => l.id === liga) ?? NEWS_LEAGUES[0];
  const topic = NEWS_TOPICS.find((t) => t.id === emne) ?? NEWS_TOPICS[0];
  const items = await leagueNews(league, now, topic.id);
  const href = (l: string, t: string) => {
    const q = new URLSearchParams({ ...(l !== "alle" && { liga: l }), ...(t !== "alle" && { emne: t }) }).toString();
    return q ? `/nyheder?${q}` : "/nyheder";
  };
  const chip = (active: boolean) => chipClass(active);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Nyheder" intro="Skader og klubskifter fra ligaerne, vi analyserer. Tryk på en overskrift for at læse hele artiklen." className="mb-8" />
      <nav aria-label="Emne" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scroll-fade-x [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 sm:[mask-image:none]">
        {NEWS_TOPICS.map((t) => (
          <Link key={t.id} href={href(league.id, t.id)} scroll={false} aria-current={t.id === topic.id ? "page" : undefined} className={chip(t.id === topic.id)}>
            {t.label}
          </Link>
        ))}
      </nav>
      <nav aria-label="Liga" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scroll-fade-x [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 sm:[mask-image:none]">
        {NEWS_LEAGUES.map((l) => (
          <Link key={l.id} href={href(l.id, topic.id)} scroll={false} aria-current={l.id === league.id ? "page" : undefined} className={chip(l.id === league.id)}>
            {l.label}
          </Link>
        ))}
      </nav>
      <section className="overflow-hidden rounded-card border border-line bg-surface">
        {items.length ? (
          <NewsList items={items} now={now} />
        ) : (
          <EmptyState className="m-4" title="Ingen nyheder lige nu" text="Ingen nyheder om skader eller klubskifter lige nu. Prøv igen om lidt." />
        )}
      </section>
      <p className="text-xs text-muted">Kilde: Google News, opdateres hver halve time. Overskrifter og links går til de oprindelige medier.</p>
    </div>
  );
}
