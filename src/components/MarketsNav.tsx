import { LinkTabs } from "@/components/ui";

const TABS = [
  { id: "terminal", label: "Terminal", href: "/markets" },
  { id: "overview", label: "Overview", href: "/markets/overview" },
  { id: "heatmap", label: "Heatmap", href: "/markets/heatmap" },
  { id: "efficiency", label: "Efficiency", href: "/markets/efficiency" },
  { id: "alerts", label: "Alerts", href: "/markets/alerts" },
];

export function MarketsNav({ active }: { active: string }) {
  return <LinkTabs label="Market Terminal sections" active={active} items={TABS} />;
}
