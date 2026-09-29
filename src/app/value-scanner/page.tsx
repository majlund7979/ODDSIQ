import { PageHeader, Tip } from "@/components/ui";
import { ValueScanner } from "@/components/ValueScanner";
import { requestNow } from "@/lib/data";
import { clvHistoryBySegment } from "@/lib/demo/analytics";
import { BOOKMAKERS } from "@/lib/demo/catalog";
import { VALUE_RULE_TEXT } from "@/lib/demo/performance";
import { ledgerRows, marketRows } from "@/lib/demo/store";
import { toScannerRow, type ScannerRow } from "@/lib/demo/views";
import { movementSignals, RLM_DEFINITION, SHARP_DEFINITION } from "@/lib/metrics/signals";

export const metadata = { title: "Value Scanner · ODDSIQ" };

export default async function ValueScannerPage() {
  const now = await requestNow();
  const clv = clvHistoryBySegment(ledgerRows(now));
  const rows = marketRows(now)
    .map((r) => toScannerRow(r, clv, movementSignals(r).map((s) => s.kind)))
    .filter((r): r is ScannerRow => r !== null);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Value Scanner"
        subtitle="Filter every pre-match market the model has priced, then rank the results by one characteristic at a time. There is no single “best” pick: each ranking answers a different question."
      />
      <ValueScanner rows={rows} now={now} books={BOOKMAKERS.map((b) => ({ id: b.id, name: b.name }))} />
      <div className="space-y-1 text-[11px] leading-relaxed text-muted">
        <p>
          Live estimates · pre-match markets with a ledgered prediction only; in-play estimates are excluded because they are never ledgered. EV = model probability × best odds − 1. Edge = model minus margin-free market probability. Model range is the ensemble&apos;s uncertainty range.
        </p>
        <p>
          <Tip text={SHARP_DEFINITION}>Sharp movement</Tip> and <Tip text={RLM_DEFINITION}>reverse line movement</Tip> flags describe price behaviour only, not who moved the price or why. Segment CLV is the historical average for the same league and market; it is greyed out below n = 200. {VALUE_RULE_TEXT}
        </p>
        <p>DEMO DATA. Nothing here is a recommendation to bet.</p>
      </div>
    </div>
  );
}
