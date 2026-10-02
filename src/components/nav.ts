export interface NavItem {
  href: string;
  label: string;
  shortcut?: string;
  /** Roadmap phase for sections not built yet. */
  phase?: number;
  children?: NavItem[];
}

/** The site's menu. NAV below is the retired terminal, kept for reference; its URLs redirect to /picks (next.config.ts). */
export const SIMPLE_NAV: NavItem[] = [
  { href: "/picks", label: "Dagens bedste bets" },
  { href: "/picks/resultater", label: "Resultater" },
];

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  {
    href: "/markets",
    label: "Markets",
    shortcut: "M",
    children: [
      { href: "/markets/overview", label: "Overview" },
      { href: "/markets/heatmap", label: "Heatmap" },
      { href: "/markets/efficiency", label: "Efficiency" },
      { href: "/markets/alerts", label: "Alerts" },
    ],
  },
  { href: "/value-scanner", label: "Value Scanner", shortcut: "V" },
  { href: "/live", label: "Live Markets", shortcut: "L" },
  { href: "/market-replay", label: "Market Replay", shortcut: "R" },
  { href: "/ai-analyst", label: "AI Analyst", shortcut: "A" },
  {
    href: "/model-lab",
    label: "Model Lab",
    children: [
      { href: "/model-lab/real-model", label: "Real Model" },
      { href: "/model-lab/ledger", label: "Prediction Ledger" },
      { href: "/model-lab/audit", label: "Model Audit" },
      { href: "/model-lab/backtest", label: "Backtest" },
      { href: "/model-lab/errors", label: "Error Analysis" },
      { href: "/model-lab/drift", label: "Drift Monitor" },
      { href: "/model-lab/report", label: "Weekly Report" },
    ],
  },
  { href: "/performance", label: "Performance", shortcut: "P", children: [{ href: "/performance/clv", label: "Closing Line Value" }] },
  { href: "/watchlist", label: "Watchlist", shortcut: "W" },
  { href: "/data-feed", label: "Data Feed" },
];

export const SHORTCUT_ROUTES: Record<string, string> = {
  m: "/markets",
  v: "/value-scanner",
  l: "/live",
  r: "/market-replay",
  a: "/ai-analyst",
  p: "/performance",
  w: "/watchlist",
};
