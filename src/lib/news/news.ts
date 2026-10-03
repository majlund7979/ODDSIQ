// Football news from Google News RSS (free, no key): headlines and links to
// the original publishers. Danish first, English when Danish has too little.
// Fetches are cached for 30 minutes; a failed fetch shows no news, never an error.

import { DEMO_MODE } from "@/lib/data";

export interface NewsItem {
  title: string;
  link: string;
  publisher: string;
  /** Epoch ms, or 0 when the feed gave no date. */
  published: number;
}

export interface NewsLeague {
  id: string;
  label: string;
  query: string;
}

/** The leagues the site follows (ODDS_SPORTS defaults), plus everything. */
export const NEWS_LEAGUES: NewsLeague[] = [
  { id: "alle", label: "Alle", query: "fodbold" },
  { id: "landshold", label: "Landsholdet", query: "landsholdet fodbold" },
  { id: "superliga", label: "Superliga", query: "Superligaen" },
  { id: "premier-league", label: "Premier League", query: '"Premier League"' },
  { id: "la-liga", label: "La Liga", query: '"La Liga"' },
  { id: "serie-a", label: "Serie A", query: '"Serie A"' },
  { id: "bundesliga", label: "Bundesliga", query: "Bundesliga" },
  { id: "ligue-1", label: "Ligue 1", query: '"Ligue 1"' },
  { id: "champions-league", label: "Champions League", query: '"Champions League"' },
];

const MAX_AGE_MS = 7 * 86_400_000;

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .trim();
}

const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : "";
};

/** Items of an RSS 2.0 feed. Google News appends " - Publisher" to titles; that is split off. */
export function parseRss(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const body = m[1];
    let title = tag(body, "title");
    const link = tag(body, "link");
    let publisher = tag(body, "source");
    if (!publisher) {
      const dash = title.lastIndexOf(" - ");
      if (dash > 0) publisher = title.slice(dash + 3);
    }
    if (publisher && title.endsWith(` - ${publisher}`)) title = title.slice(0, -(publisher.length + 3));
    const published = Date.parse(tag(body, "pubDate")) || 0;
    if (title && /^https?:\/\//.test(link)) items.push({ title, link, publisher, published });
  }
  return items;
}

export function googleNewsUrl(query: string, lang: "da" | "en"): string {
  const loc = lang === "da" ? { hl: "da", gl: "DK", ceid: "DK:da" } : { hl: "en-GB", gl: "GB", ceid: "GB:en" };
  return `https://news.google.com/rss/search?${new URLSearchParams({ q: `${query} when:7d`, ...loc })}`;
}

/** Newest first, recent only, one per headline. */
export function tidy(items: NewsItem[], now: number, limit: number): NewsItem[] {
  const seen = new Set<string>();
  return items
    .filter((i) => !i.published || now - i.published <= MAX_AGE_MS)
    .sort((a, b) => b.published - a.published)
    .filter((i) => {
      const k = i.title.toLowerCase().replace(/\W+/g, "");
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, limit);
}

async function fetchFeed(url: string): Promise<NewsItem[]> {
  try {
    const res = await fetch(url, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(3000), headers: { "user-agent": "Mozilla/5.0 Oddsanalyse" } });
    return res.ok ? parseRss(await res.text()) : [];
  } catch {
    return [];
  }
}

/** Per-instance cache, so repeat visits skip the network (and a failing feed is not retried on every view). */
const memo = new Map<string, { at: number; items: NewsItem[] }>();
const MEMO_MS = 30 * 60_000;
const MEMO_EMPTY_MS = 10 * 60_000;

async function search(query: string, now: number, limit: number, minDanish: number): Promise<NewsItem[]> {
  if (DEMO_MODE) return tidy(demoNews(query, now), now, limit);
  const hit = memo.get(query);
  if (hit && now - hit.at < (hit.items.length ? MEMO_MS : MEMO_EMPTY_MS)) return tidy(hit.items, now, limit);
  // Both languages at once: one round trip instead of two when Danish has too little.
  const [da, en] = await Promise.all([fetchFeed(googleNewsUrl(query, "da")), fetchFeed(googleNewsUrl(query, "en"))]);
  const items = da.length >= minDanish ? da : [...da, ...en];
  if (memo.size > 500) memo.clear();
  memo.set(query, { at: now, items });
  return tidy(items, now, limit);
}

export const leagueNews = (league: NewsLeague, now: number, limit = 20) => search(league.query, now, limit, 8);

/** News that mentions either team. */
export const teamNews = (home: string, away: string, now: number, limit = 4) => search(`"${home}" OR "${away}"`, now, limit, 3);

/** Deterministic, labelled stand-in headlines for DEMO_MODE (no network). */
function demoNews(query: string, now: number): NewsItem[] {
  const names = [...query.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const subject = names.length ? names : [query];
  const lines = ["træner melder klar til weekendens kamp", "nøglespiller tilbage i træning", "ny skade kan koste pladsen i startopstillingen", "presset før vigtig kamp"];
  return subject.flatMap((s, i) =>
    lines.slice(0, names.length ? 2 : 4).map((l, j) => ({ title: `DEMO: ${s}, ${l}`, link: "https://news.google.com/", publisher: "Demo-nyheder", published: now - (i * 2 + j + 1) * 3_600_000 })),
  );
}
