export interface NavItem {
  href: string;
  label: string;
  shortcut?: string;
  /** Roadmap phase for sections not built yet. */
  phase?: number;
  children?: NavItem[];
}

export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/markets", label: "Markets", shortcut: "M" },
  { href: "/matches", label: "Matches", phase: 7 },
  { href: "/value-scanner", label: "Value Scanner", shortcut: "V", phase: 6 },
  { href: "/live", label: "Live Markets", shortcut: "L", phase: 7 },
  { href: "/ai-analyst", label: "AI Analyst", shortcut: "A", phase: 8 },
  {
    href: "/model-lab",
    label: "Model Lab",
    phase: 5,
    children: [
      { href: "/model-lab/ledger", label: "Prediction Ledger" },
      { href: "/model-lab/audit", label: "Model Audit" },
    ],
  },
  { href: "/performance", label: "Performance", shortcut: "P", phase: 5 },
  { href: "/my-bets", label: "My Bets", phase: 8 },
];

export const SHORTCUT_ROUTES: Record<string, string> = {
  m: "/markets",
  v: "/value-scanner",
  l: "/live",
  a: "/ai-analyst",
  p: "/performance",
  w: "/watchlist",
};
