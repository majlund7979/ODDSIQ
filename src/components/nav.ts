export interface NavItem {
  href: string;
  label: string;
  /** Short label for the mobile tab bar. */
  short: string;
  icon: "bets" | "tips" | "results" | "news" | "league" | "friends" | "admin" | "account";
  /** False keeps it out of the phone tab bar (it is linked from Min konto instead). */
  mobile?: false;
}

/** The site's menu. The old terminal pages were removed; their URLs redirect to /picks (next.config.ts). */
export const SIMPLE_NAV: NavItem[] = [
  { href: "/picks", label: "Dagens bets", short: "Bets", icon: "bets" },
  { href: "/tips", label: "Ugens tips", short: "Tips", icon: "tips" },
  { href: "/picks/resultater", label: "Vores resultater", short: "Resultater", icon: "results" },
  { href: "/nyheder", label: "Nyheder", short: "Nyheder", icon: "news" },
  { href: "/picks/liga", label: "Vennerligaen", short: "Liga", icon: "league" },
];

export const FRIENDS_NAV: NavItem = { href: "/venner", label: "Venner", short: "Venner", icon: "friends", mobile: false };
export const ADMIN_NAV: NavItem = { href: "/admin", label: "Admin", short: "Admin", icon: "admin", mobile: false };
export const ACCOUNT_NAV: NavItem = { href: "/account", label: "Min konto", short: "Konto", icon: "account" };
