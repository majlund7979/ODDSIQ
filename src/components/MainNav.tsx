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

function Icon({ name }: { name: NavItem["icon"] }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

/** The exact match wins, so "Resultater" is not also shown under "Dagens bets". */
function activeHref(pathname: string, items: NavItem[]) {
  return items.filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

/**
 * The menu in the header from 1280 px. The owner's longer menu packs its items closer so the header fits the page
 * width; should it still not fit, the menu scrolls sideways instead of widening the page.
 */
export function TopNav({ items }: { items: NavItem[] }) {
  const active = activeHref(usePathname(), items);
  const long = items.length > SIMPLE_NAV.length;
  return (
    <nav aria-label="Menu" className={`scroll-fade-x hidden min-w-0 items-center overflow-x-auto rounded-full bg-surface-2 p-1 [scrollbar-width:none] xl:flex ${long ? "" : "gap-1"}`}>
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={i.href === active ? "page" : undefined}
          className={`whitespace-nowrap rounded-full py-2 text-sm font-semibold transition-colors ${long ? "px-2" : "px-3"} ${i.href === active ? "bg-lime text-accent" : "text-ink-2 hover:bg-surface-3 hover:text-ink"}`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

/** App-style tab bar at the bottom of the screen on phones. */
export function BottomNav({ items }: { items: NavItem[] }) {
  const active = activeHref(usePathname(), items);
  return (
    <nav aria-label="Menu" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-page pb-[env(safe-area-inset-bottom)] xl:hidden">
      <div className="mx-auto flex max-w-md">
        {items.filter((i) => i.mobile !== false).map((i) => (
          <Link
            key={i.href}
            href={i.href}
            aria-current={i.href === active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-semibold ${i.href === active ? "text-accent" : "text-muted"}`}
          >
            <span className={`flex h-8 w-12 items-center justify-center rounded-full ${i.href === active ? "bg-lime" : ""}`}>
              <Icon name={i.icon} />
            </span>
            {i.short}
          </Link>
        ))}
      </div>
    </nav>
  );
}
