import Link from "next/link";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Ago } from "@/components/Clock";
import { MarketsNav } from "@/components/MarketsNav";
import { LinkTabs, PageHeader, Panel, Tip } from "@/components/ui";
import { ALERT_WINDOW_HOURS, type AlertType } from "@/lib/demo/alerts";
import { fmtInt, fmtTime } from "@/lib/format";
import { terminal } from "@/lib/terminal";

export const metadata = { title: "Market Alerts · ODDSIQ" };

const ICON: Record<AlertType, string> = {
  ODDS_MOVEMENT: "⚡",
  MODEL_MARKET_DISCREPANCY: "◆",
  LINEUP_CHANGE: "▣",
  INJURY_UPDATE: "✚",
  MARKET_SUSPENSION: "❚❚",
  ODDS_STALE: "◷",
  UNUSUAL_VOLATILITY: "≋",
  MODEL_CONFIDENCE_CHANGE: "◎",
};

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const term = await terminal();
  const ALERT_TYPES = term.alertTypes;
  const { type } = await searchParams;
  const all = term.alerts();
  const active = ALERT_TYPES.find((t) => t.id === type)?.id ?? "all";
  const alerts = active === "all" ? all : all.filter((a) => a.type === active);
  const count = (t: AlertType) => all.filter((a) => a.type === t).length;

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={30} />
      <PageHeader
        title="Market Alerts"
        subtitle={`Everything the alert engine has flagged in the last ${ALERT_WINDOW_HOURS} hours, newest first. The page refreshes itself every 30 seconds.`}
        right={<span className="text-xs text-muted">{fmtInt(all.length)} alerts in {ALERT_WINDOW_HOURS}h</span>}
      />
      <MarketsNav active="alerts" />
      <LinkTabs
        label="Alert type"
        active={active}
        items={[{ id: "all", label: `All (${all.length})`, href: "/markets/alerts" }, ...ALERT_TYPES.map((t) => ({ id: t.id, label: `${t.label} (${count(t.id)})`, href: `/markets/alerts?type=${t.id}` }))]}
      />

      <Panel>
        {alerts.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">No alerts of this type in the last {ALERT_WINDOW_HOURS} hours.</p>
        ) : (
          <ul className="divide-y divide-line">
            {alerts.slice(0, 200).map((a) => {
              const t = ALERT_TYPES.find((x) => x.id === a.type)!;
              const body = (
                <div className="grid gap-x-4 gap-y-1 px-4 py-2.5 sm:grid-cols-[92px_1fr_auto]">
                  <div className="num text-xs text-ink-2">
                    {fmtTime(a.at, true)}
                    <div className="text-[10.5px] text-muted">
                      <Ago at={a.at} />
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10.5px] font-semibold uppercase tracking-wider text-warning">
                      {ICON[a.type]} {t.label}
                    </div>
                    <div className="truncate text-sm">
                      {a.match}
                      {a.selection && (
                        <span className="text-ink-2">
                          {" "}
                          · {a.market} · {a.selection}
                        </span>
                      )}
                    </div>
                    <div className="text-[13px] text-ink-2">{a.headline}</div>
                    <div className="text-[11px] text-muted">
                      {a.sport} · {a.league}
                    </div>
                  </div>
                  <dl className="flex flex-wrap gap-x-4 gap-y-1 self-center text-xs sm:justify-end">
                    {a.fields.map((f) => (
                      <div key={f.label} className="text-right">
                        <dt className="text-[10px] uppercase tracking-wider text-muted">{f.label}</dt>
                        <dd className="num text-ink">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
              return (
                <li key={a.id}>
                  {a.selectionId ? (
                    <Link href={`/markets/${a.selectionId}`} className="block hover:bg-surface-2">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Alert rules">
        <ul className="divide-y divide-line text-sm">
          {ALERT_TYPES.map((t) => (
            <li key={t.id} className="flex gap-3 px-4 py-2">
              <span className="w-56 shrink-0 text-ink-2">
                {ICON[t.id]} {t.label}
              </span>
              <span className="text-muted">{t.rule}</span>
            </li>
          ))}
        </ul>
        <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
          Alerts describe what changed, never why.{" "}
          {term.live ? (
            "Prices come from the odds feed and team news from the statistics feed. Times are UTC."
          ) : (
            <>
              <Tip text="News items in DEMO_MODE are synthetic and generated with the price paths.">News items are synthetic in DEMO_MODE.</Tip> Times are UTC. DEMO DATA.
            </>
          )}
        </p>
      </Panel>
    </div>
  );
}
