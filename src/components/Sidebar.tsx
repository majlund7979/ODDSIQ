"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, SIMPLE_NAV, type NavItem } from "./nav";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function Item({ item, pathname, nested = false, exact = false }: { item: NavItem; pathname: string; nested?: boolean; exact?: boolean }) {
  const active = nested || exact ? pathname === item.href : isActive(pathname, item.href) && !item.children?.some((c) => pathname === c.href);
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
  const inAdvanced = NAV.some((i) => isActive(pathname, i.href));
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5 p-2">
      {SIMPLE_NAV.map((item) => (
        <Item key={item.href} item={item} pathname={pathname} exact />
      ))}
      <details open={inAdvanced} className="mt-4 group/adv">
        <summary className="cursor-pointer list-none rounded px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted hover:text-ink">
          <span className="inline-block transition-transform group-open/adv:rotate-90">›</span> Avancerede værktøjer
        </summary>
        <div className="mt-1 flex flex-col gap-0.5">
          {NAV.map((item) => (
            <div key={item.href}>
              <Item item={item} pathname={pathname} />
              {item.children?.map((c) => <Item key={c.href} item={c} pathname={pathname} nested />)}
            </div>
          ))}
        </div>
      </details>
    </nav>
  );
}
