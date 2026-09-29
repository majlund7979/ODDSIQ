import Link from "next/link";
import { Badge, PageHeader, Panel, Signed, Tip } from "@/components/ui";
import { requestNow } from "@/lib/data";
import { ledgerAudit, ledgerRows } from "@/lib/demo/store";
import { fmtDateTime, fmtInt, fmtOdds, fmtPct, fmtSignedPct } from "@/lib/format";
import { CLV_METHODOLOGY } from "@/lib/metrics/clv";

export const metadata = { title: "Prediction Ledger · ODDSIQ" };

const PAGE_SIZE = 50;

export default async function LedgerPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string; status?: string }> }) {
  const now = await requestNow();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const status = sp.status ?? "all";
  const audit = ledgerAudit(now);
  const all = ledgerRows(now).reverse();
  const rows = all.filter(
    (r) =>
      (status === "all" || r.status === status) &&
      (!q || `${r.prediction.id} ${r.event.homeName} ${r.event.awayName} ${r.event.leagueName} ${r.selectionName} ${r.prediction.modelVersionId}`.toLowerCase().includes(q)),
  );
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const qs = (p: number) => `?${new URLSearchParams({ ...(q && { q }), ...(status !== "all" && { status }), page: String(p) })}`;
  const csvHref = `/api/ledger.csv?${new URLSearchParams({ ...(q && { q }), ...(status !== "all" && { status }) })}`;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Prediction Ledger"
        subtitle="Every pre-match prediction the model publishes is recorded here with its timestamp, price, probability, confidence and model version. Entries are append-only and hash-chained, so none can be edited, removed or back-dated without breaking the chain."
        right={
          <a href={csvHref} className="rounded border border-line-strong px-3 py-1.5 text-xs text-ink hover:border-accent">
            Export CSV
          </a>
        }
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-line bg-surface px-4 py-3 text-xs text-ink-2">
        {audit.verification.ok ? <Badge tone="good">✓ Chain verified</Badge> : <Badge tone="critical">✕ Chain broken at #{audit.verification.brokenAt}</Badge>}
        <span>
          <span className="num text-ink">{fmtInt(audit.count)}</span> predictions
        </span>
        <span>
          Head hash <span className="num text-muted">{audit.headHash?.slice(0, 20)}…</span>
        </span>
        <span>
          Missing <span className="num text-ink">{audit.missing.length}</span> markets
        </span>
        <Link href="/model-lab/audit" className="text-accent hover:underline">
          Full audit →
        </Link>
        <Badge tone="warning" className="ml-auto">
          Demo data
        </Badge>
      </div>

      <Panel
        title="Entries"
        right={
          <form className="flex items-center gap-2" action="/model-lab/ledger">
            <input name="q" defaultValue={sp.q} placeholder="Team, league, model, id" className="rounded border border-line bg-surface-2 px-2 py-1 text-xs outline-none focus:border-accent" />
            <select name="status" defaultValue={status} className="rounded border border-line bg-surface-2 px-2 py-1 text-xs">
              <option value="all">All</option>
              <option value="settled">Settled</option>
              <option value="closed">Closed, awaiting result</option>
              <option value="pending">Pending</option>
            </select>
            <button className="rounded border border-line-strong px-2 py-1 text-xs hover:border-accent">Filter</button>
          </form>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1320px] text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-[10.5px] uppercase tracking-wider text-muted">
                {["#", "Timestamp", "Event", "Market", "Prediction", "Prob.", "Odds", "Model", "Conf.", "Closing", "Result"].map((h) => (
                  <th key={h} className={`px-3 py-2 font-medium ${["Prob.", "Odds", "Conf.", "Closing", "#"].includes(h) ? "text-right" : "text-left"}`}>
                    {h}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">
                  <Tip text={CLV_METHODOLOGY}>CLV</Tip>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.prediction.id} className="border-b border-line/60 hover:bg-surface-2 [&>td]:whitespace-nowrap">
                  <td className="num px-3 py-1.5 text-right text-muted" title={r.prediction.hash}>
                    {r.prediction.seq}
                  </td>
                  <td className="num px-3 py-1.5 text-xs text-ink-2">{fmtDateTime(r.prediction.createdAt)}</td>
                  <td className="px-3 py-1.5">
                    <Link href={`/markets/${r.prediction.selectionId}`} className="hover:text-accent">
                      {r.event.homeName} vs {r.event.awayName}
                    </Link>
                    <div className="text-[11px] text-muted">{r.event.leagueName}</div>
                  </td>
                  <td className="px-3 py-1.5 text-ink-2">{r.marketName}</td>
                  <td className="px-3 py-1.5">{r.selectionName}</td>
                  <td className="num px-3 py-1.5 text-right">{fmtPct(r.prediction.probability)}</td>
                  <td className="num px-3 py-1.5 text-right" title={r.bookmakerName}>
                    {fmtOdds(r.prediction.odds)}
                  </td>
                  <td className="num px-3 py-1.5 text-xs text-ink-2">{r.prediction.modelVersionId}</td>
                  <td className="num px-3 py-1.5 text-right text-ink-2">{r.prediction.confidence}</td>
                  <td className="num px-3 py-1.5 text-right text-ink-2">{fmtOdds(r.closingOdds)}</td>
                  <td className="px-3 py-1.5">
                    {r.status === "settled" ? (
                      <span className={r.result === "won" ? "text-good" : "text-ink-2"}>
                        {r.result === "won" ? "✓ Won" : "✕ Lost"} <span className="num text-xs text-muted">{r.event.score?.home}–{r.event.score?.away}</span>
                      </span>
                    ) : (
                      <span className="text-muted">{r.status === "closed" ? "In play" : "Pending"}</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right">{r.clv === undefined ? <span className="text-muted">—</span> : <Signed value={r.clv}>{fmtSignedPct(r.clv)}</Signed>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-line px-4 py-2 text-xs text-muted">
          <span>
            {fmtInt(rows.length)} entries · page {page} of {pages}
          </span>
          <span className="flex gap-3">
            {page > 1 && (
              <Link href={qs(page - 1)} className="text-accent hover:underline">
                ← Newer
              </Link>
            )}
            {page < pages && (
              <Link href={qs(page + 1)} className="text-accent hover:underline">
                Older →
              </Link>
            )}
          </span>
        </div>
      </Panel>
      <p className="text-[11px] text-muted">
        Historical record. Past results do not guarantee future performance. Closing odds are the median bookmaker price at kickoff; CLV uses the de-vigged closing probability.
      </p>
    </div>
  );
}
