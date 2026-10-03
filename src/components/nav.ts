export interface NavItem {
  href: string;
  label: string;
  /** Short label for the mobile tab bar. */
  short: string;
  icon: "bets" | "results" | "news" | "league" | "friends" | "account";
}

/** The site's menu. The old terminal pages were removed; their URLs redirect to /picks (next.config.ts). */
export const SIMPLE_NAV: NavItem[] = [
  { href: "/picks", label: "Dagens bets", short: "Bets", icon: "bets" },
  { href: "/picks/resultater", label: "Resultater", short: "Resultater", icon: "results" },
  { href: "/nyheder", label: "Nyheder", short: "Nyheder", icon: "news" },
  { href: "/picks/liga", label: "Vennerligaen", short: "Liga", icon: "league" },
];

export const FRIENDS_NAV: NavItem = { href: "/venner", label: "Venner", short: "Venner", icon: "friends" };
export const ACCOUNT_NAV: NavItem = { href: "/account", label: "Min konto", short: "Konto", icon: "account" };
