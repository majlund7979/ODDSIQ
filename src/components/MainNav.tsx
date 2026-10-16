"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SIMPLE_NAV, type NavItem } from "./nav";

const ICONS: Record<NavItem["icon"], React.ReactNode> = {
  bets: <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7L12 3z" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5L21 21" />
    </>
  ),
  tips: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M7.5 12.5l3 3 6-6.5" />
    </>
  ),
  results: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  news: <path d="M4 5h13v14H6a2 2 0 01-2-2V5zM17 9h3v8a2 2 0 01-2 2M8 9h5M8 13h5" />,
  league: <path d="M7 4h10v4a5 5 0 01-10 0V4zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3M12 13v4M8 21h8M9 17h6v4H9z" />,
  friends: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.8a3.3 3.3 0 010 6.4M18 14.8c1.9.7 3.1 2.4 3.5 5.2" />
    </>
  ),
  admin: (
    <>
      <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  account: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1-4.2 4.1-6.5 8-6.5s7 2.3 8 6.5" />
    </>
  ),
};

export function NavIcon({ name, className = "h-5 w-5" }: { name: NavItem["icon"]; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

/** The exact match wins, so "Resultater" is not also shown under "Dagens bets". */
function activeHref(pathname: string, items: NavItem[]) {
  return items.filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

/**
 * The menu in the header from 1280 px: plain words with a signal-coloured rule under the page you are on, like the
 * markings on a pitch. Should the owner's longer menu not fit, it scrolls sideways instead of widening the page.
 */
export function TopNav({ items }: { items: NavItem[] }) {
  const active = activeHref(usePathname(), items);
  const long = items.length > SIMPLE_NAV.length;
  return (
    <nav aria-label="Menu" className="scroll-fade-x hidden h-16 min-w-0 items-stretch overflow-x-auto [scrollbar-width:none] xl:flex">
      {items.map((i) => {
        const on = i.href === active;
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={on ? "page" : undefined}
            className={`group relative flex items-center whitespace-nowrap text-sm font-semibold transition-colors focus-visible:outline-offset-[-14px] ${long ? "px-2.5" : "px-3.5"} ${on ? "text-ink" : "text-ink-2 hover:text-ink"}`}
          >
            {i.label}
            <span
              aria-hidden
              className={`absolute inset-x-2.5 bottom-0 h-[3px] rounded-t-full bg-accent transition-[scale,opacity] duration-300 ease-[var(--ease-out)] ${on ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0 group-hover:scale-x-50 group-hover:opacity-40"}`}
            />
          </Link>
        );
      })}
    </nav>
  );
}

/** App-style tab bar at the bottom of the screen on phones: at most five items, each a full-height touch target. */
export function BottomNav({ items }: { items: NavItem[] }) {
  const active = activeHref(usePathname(), items);
  return (
    <nav aria-label="Menu" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-page/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 xl:hidden">
      <div className="mx-auto flex max-w-md">
        {items
          .filter((i) => i.mobile !== false)
          .map((i) => {
            const on = i.href === active;
            return (
              <Link
                key={i.href}
                href={i.href}
                aria-current={on ? "page" : undefined}
                className={`relative flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors focus-visible:-outline-offset-4 ${on ? "text-ink" : "text-muted hover:text-ink-2"}`}
              >
                <span aria-hidden className={`absolute top-0 h-[3px] w-8 rounded-b-full bg-accent transition-[scale,opacity] duration-300 ${on ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0"}`} />
                <NavIcon name={i.icon} className={`h-[22px] w-[22px] transition-colors ${on ? "text-accent" : ""}`} />
                {i.short}
              </Link>
            );
          })}
      </div>
    </nav>
  );
}
