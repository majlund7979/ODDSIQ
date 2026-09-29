"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, type NavItem } from "./nav";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function Item({ item, pathname, nested = false }: { item: NavItem; pathname: string; nested?: boolean }) {
  const active = nested ? pathname === item.href : isActive(pathname, item.href) && !item.children?.some((c) => pathname === c.href);
  return (
    <Link
      href={item.href}
      className={`group flex items-center justify-between rounded px-2.5 py-1.5 text-[13px] transition-colors ${
        active ? "bg-surface-3 text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
      } ${nested ? "ml-3 text-[12px]" : ""}`}
    >
      <span className="flex items-center gap-2">
        {active && <span aria-hidden className="h-3 w-0.5 rounded bg-accent" />}
        {item.label}
      </span>
      {item.shortcut && <kbd className="num text-[10px] text-muted opacity-0 group-hover:opacity-100">{item.shortcut}</kbd>}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5 p-2">
      {NAV.map((item) => (
        <div key={item.href}>
          {item.href === "/markets" && <div className="mt-3 mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">Market Terminal</div>}
          <Item item={item} pathname={pathname} />
          {item.children?.map((c) => <Item key={c.href} item={c} pathname={pathname} nested />)}
          {item.href === "/markets" && <div className="mb-3" />}
        </div>
      ))}
    </nav>
  );
}
