// One entry point for the terminal pages' data. DEMO_MODE (default) serves the
// deterministic demo universe; with DEMO_MODE=false the same shapes come from
// the live odds feed and the real model in Postgres.

import { connection } from "next/server";
import { DataSourceNotConfiguredError, DEMO_MODE } from "@/lib/data";
import { db, DATABASE_CONFIGURED } from "@/lib/db";
import * as demo from "@/lib/demo/store";
import type { LedgerAudit, LedgerRow, MarketDetail, MarketRow, MatchView } from "@/lib/demo/store";
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
  };
}
