export interface NavItem {
  href: string;
  label: string;
  shortcut?: string;
  /** Roadmap phase for sections not built yet. */
  phase?: number;
  children?: NavItem[];
}

/** The site's menu. The old terminal pages were removed; their URLs redirect to /picks (next.config.ts). */
export const SIMPLE_NAV: NavItem[] = [
  { href: "/picks", label: "Dagens bedste bets" },
  { href: "/picks/resultater", label: "Resultater" },
];
