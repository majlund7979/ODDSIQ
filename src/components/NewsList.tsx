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
        <li key={n.link + n.title} className={compact ? "" : "px-5 py-3.5"}>
          <a href={n.link} target="_blank" rel="noopener noreferrer" className="group block">
            <span className={`block leading-snug group-hover:text-accent ${compact ? "text-sm" : "text-[15px] font-medium"}`}>{n.title}</span>
            <span className="mt-0.5 block text-xs text-muted">
              {n.publisher}
              {n.published ? ` · ${ago(n.published, now)}` : ""}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
