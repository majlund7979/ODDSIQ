import { requestNow } from "@/lib/data";
import { ledgerRows } from "@/lib/demo/store";

const HEADER = [
  "seq",
  "prediction_id",
  "timestamp_utc",
  "sport",
  "league",
  "event",
  "kickoff_utc",
  "market",
  "selection",
  "probability",
  "ci_low",
  "ci_high",
  "odds",
  "bookmaker",
  "model_version",
  "confidence",
  "closing_odds",
  "result",
  "clv",
  "prev_hash",
  "hash",
  "data",
];

function cell(v: unknown): string {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request) {
  const now = await requestNow();
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const status = url.searchParams.get("status") ?? "all";
  const rows = ledgerRows(now).filter(
    (r) =>
      (status === "all" || r.status === status) &&
      (!q || `${r.prediction.id} ${r.event.homeName} ${r.event.awayName} ${r.event.leagueName} ${r.selectionName} ${r.prediction.modelVersionId}`.toLowerCase().includes(q)),
  );
  const lines = [HEADER.join(",")];
  for (const r of rows) {
    const p = r.prediction;
    lines.push(
      [
        p.seq,
        p.id,
        new Date(p.createdAt).toISOString(),
        r.event.sportName,
        r.event.leagueName,
        `${r.event.homeName} vs ${r.event.awayName}`,
        new Date(r.event.kickoff).toISOString(),
        r.marketName,
        r.selectionName,
        p.probability.toFixed(6),
        p.ciLow.toFixed(6),
        p.ciHigh.toFixed(6),
        p.odds.toFixed(2),
        r.bookmakerName,
        p.modelVersionId,
        p.confidence,
        r.closingOdds?.toFixed(2),
        r.status === "settled" ? r.result : r.status,
        r.clv?.toFixed(5),
        p.prevHash,
        p.hash,
        "DEMO",
      ]
        .map(cell)
        .join(","),
    );
  }
  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="oddsiq-ledger-${new Date(now).toISOString().slice(0, 10)}.csv"`,
    },
  });
}
