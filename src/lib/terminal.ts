// One entry point for the terminal pages' data. DEMO_MODE (default) serves the
// deterministic demo universe; with DEMO_MODE=false the same shapes come from
// the live odds feed and the real model in Postgres.

import { connection } from "next/server";
import { DataSourceNotConfiguredError, DEMO_MODE } from "@/lib/data";
import { db, DATABASE_CONFIGURED } from "@/lib/db";
import { ALERT_TYPES, marketAlerts, type MarketAlert } from "@/lib/demo/alerts";
import { BOOKMAKERS } from "@/lib/demo/catalog";
import { demoPersonal, type PersonalCtx } from "@/lib/demo/personal";
import * as demo from "@/lib/demo/store";
import { realPersonal } from "@/lib/real/personal";
import type { LedgerAudit, LedgerRow, MarketDetail, MarketRow, MatchView, SettledSelection } from "@/lib/demo/store";
import { LIVE_ALERT_TYPES, realAlerts } from "@/lib/real/alerts";
import { realSettledSelections } from "@/lib/real/settled";
import type { TeamNews } from "@/lib/stats/news";
import { realFinishedEvents, realMarketDetail, realMatchView, realSnapshot, type EventView, type SourceView } from "@/lib/real/store";

export interface Terminal {
  live: boolean;
  now: number;
  /** When the displayed prices were last refreshed. */
  feedTime: number;
  /** Source label for metric context lines. */
  ledgerSource: string;
  /** Footnote label: "DEMO DATA" or the live source. */
  dataLabel: string;
  marketRows(): MarketRow[];
  ledgerRows(): LedgerRow[];
  ledgerAudit(): LedgerAudit;
  dataSources(): SourceView[];
  marketDetail(selectionId: string): (MarketDetail & { unavailableReason?: string | null; teamNews?: TeamNews | null }) | undefined;
  matchView(eventId: string): MatchView | undefined;
  /** Finished matches, newest first. */
  finishedEvents(): EventView[];
  /** Alerts fired in the last 24 hours, newest first, and the rules that apply to this data. */
  alerts(): MarketAlert[];
  alertTypes: typeof ALERT_TYPES;
  /** Settled markets with their price history, and the bookmakers quoting them. */
  settled(): Promise<{ rows: SettledSelection[]; books: { id: string; name: string }[] }>;
  /** Data for the watchlist, My Bets and the AI Analyst. */
  personal(): Promise<PersonalCtx>;
}

export async function terminal(): Promise<Terminal> {
  await connection();
  const now = Date.now();
  if (DEMO_MODE) {
    return {
      live: false,
      now,
      feedTime: demo.feedTime(now),
      ledgerSource: "ODDSIQ prediction ledger (DEMO DATA)",
      dataLabel: "DEMO DATA",
      marketRows: () => demo.marketRows(now),
      ledgerRows: () => demo.ledgerRows(now),
      ledgerAudit: () => demo.ledgerAudit(now),
      dataSources: () => demo.dataSources(now),
      marketDetail: (id) => demo.marketDetail(id, now),
      matchView: (id) => demo.matchView(id, now),
      finishedEvents: () => demo.replayableEvents(now),
      alerts: () => marketAlerts(now),
      alertTypes: ALERT_TYPES,
      settled: async () => ({ rows: demo.settledSelections(now), books: BOOKMAKERS }),
      personal: async () => demoPersonal(now),
    };
  }
  if (!DATABASE_CONFIGURED) throw new DataSourceNotConfiguredError();
  const snap = await realSnapshot(db(), now);
  return {
    live: true,
    now,
    feedTime: Math.max(0, ...snap.rows.map((r) => r.lastUpdate)) || now,
    ledgerSource: "ODDSIQ prediction ledger (live)",
    dataLabel: "Live odds feed and ODDSIQ real model",
    marketRows: () => snap.rows,
    ledgerRows: () => snap.ledger,
    ledgerAudit: () => snap.audit,
    dataSources: () => snap.sources,
    marketDetail: (id) => realMarketDetail(snap, id),
    matchView: (id) => realMatchView(snap, id),
    finishedEvents: () => realFinishedEvents(snap),
    alerts: () => realAlerts(snap),
    alertTypes: LIVE_ALERT_TYPES,
    settled: () => realSettledSelections(db(), now),
    personal: () => realPersonal(db(), snap),
  };
}
