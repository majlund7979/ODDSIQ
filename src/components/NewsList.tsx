import { shortDate } from "@/lib/format";
import type { NewsItem } from "@/lib/news/news";

function ago(t: number, now: number): string {
  if (!t) return "";
  const h = Math.max(0, Math.round((now - t) / 3_600_000));
  if (h < 1) return "lige nu";
  if (h < 24) return `${h} t siden`;
  const d = Math.round(h / 24);
  return d === 1 ? "i går" : shortDate(t);
}

export function NewsList({ items, now, compact = false }: { items: NewsItem[]; now: number; compact?: boolean }) {
  return (
    <ul className={compact ? "space-y-2.5" : "divide-y divide-line"}>
      {items.map((n) => (
        <li key={n.link + n.title}>
          <a href={n.link} target="_blank" rel="noopener noreferrer" className={`group block transition-colors ${compact ? "rounded-field" : "px-5 py-4 hover:bg-surface-2 focus-visible:-outline-offset-2"}`}>
            <span className={`block leading-snug group-hover:text-accent ${compact ? "text-sm" : "text-md font-medium"}`}>
              {n.title}
              <span aria-hidden className="ml-1 inline-block text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-accent">
                ↗
              </span>
              <span className="sr-only"> (åbner i nyt vindue)</span>
            </span>
            <span className="mt-1 block text-xs text-ink-2">
              {n.publisher}
              {n.published ? ` · ${ago(n.published, now)}` : ""}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
