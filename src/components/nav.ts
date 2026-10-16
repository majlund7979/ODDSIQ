export interface NavItem {
  href: string;
  label: string;
  /** Short label for the mobile tab bar. */
  short: string;
  icon: "bets" | "search" | "tips" | "results" | "news" | "league" | "friends" | "admin" | "account";
  /** False keeps it out of the phone tab bar (it is linked from the header or Min konto instead). */
  mobile?: false;
}

/** The site's menu. The old terminal pages were removed; their URLs redirect to /picks (next.config.ts). */
export const SIMPLE_NAV: NavItem[] = [
  { href: "/picks", label: "Bets", short: "Bets", icon: "bets" },
  { href: "/picks/spillere", label: "Søg hold", short: "Hold", icon: "search" },
  { href: "/tips", label: "Tips", short: "Tips", icon: "tips" },
  { href: "/picks/resultater", label: "Resultater", short: "Resultater", icon: "results" },
  // Five is the most a phone's tab bar holds comfortably; on phones the news sit behind an icon in the header.
  { href: "/nyheder", label: "Nyheder", short: "Nyheder", icon: "news", mobile: false },
  { href: "/picks/liga", label: "Liga", short: "Liga", icon: "league" },
];

export const FRIENDS_NAV: NavItem = { href: "/venner", label: "Venner", short: "Venner", icon: "friends", mobile: false };
export const ADMIN_NAV: NavItem = { href: "/admin", label: "Admin", short: "Admin", icon: "admin", mobile: false };
/** Reached from the avatar in the header on every screen size, so it is never in the tab bar. */
export const ACCOUNT_NAV: NavItem = { href: "/account", label: "Min konto", short: "Konto", icon: "account", mobile: false };
