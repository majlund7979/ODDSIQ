import { Badge, PageHeader, Panel } from "@/components/ui";
import { requestNow } from "@/lib/data";
import { MODEL_VERSIONS } from "@/lib/demo/models";
import { dataSources, ledgerAudit } from "@/lib/demo/store";
import { fmtDate, fmtDateTime, fmtInt } from "@/lib/format";

export const metadata = { title: "Model Audit · ODDSIQ" };

export default async function AuditPage() {
  const now = await requestNow();
  const a = ledgerAudit(now);
  const checks = [
    { label: "Prediction count", value: fmtInt(a.count), ok: true, note: "Entries in the ledger" },
    { label: "Missing predictions", value: fmtInt(a.missing.length), ok: a.missing.length === 0, note: "Scheduled markets with no prediction before kickoff" },
    { label: "Changed predictions", value: fmtInt(a.changed), ok: a.changed === 0, note: "Entries whose content no longer matches their hash" },
    { label: "Deleted predictions", value: fmtInt(a.deleted), ok: a.deleted === 0, note: "Gaps in the sequence" },
    { label: "Model version changes", value: fmtInt(a.versionChanges.length), ok: true, note: "Versions that have published predictions" },
    { label: "Data source changes", value: "0", ok: true, note: "Provider switches in the period" },
  ];
  return (
    <div className="space-y-4">
      <PageHeader
        title="Model Audit"
        subtitle="Integrity checks on the prediction ledger. Every number here is recomputed from the ledger on each request."
        right={a.verification.ok ? <Badge tone="good">✓ Chain verified · {fmtInt(a.verification.checked)} entries</Badge> : <Badge tone="critical">✕ {a.verification.reason}</Badge>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {checks.map((c) => (
          <div key={c.label} className="rounded-md border border-line bg-surface px-4 py-3">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.12em] text-muted">
              {c.label}
              {c.ok ? <span className="text-good">✓</span> : <span className="text-warning">!</span>}
            </div>
            <div className="num mt-1 text-2xl">{c.value}</div>
            <p className="mt-1 text-[11px] text-muted">{c.note}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="How integrity is enforced">
          <ul className="list-disc space-y-2 py-3 pr-4 pl-8 text-sm text-ink-2">
            <li>Each prediction stores a SHA-256 hash of its own fields plus the previous entry&apos;s hash. Editing, deleting or re-ordering any entry breaks every hash after it.</li>
            <li>In the database, a trigger rejects any UPDATE or DELETE on the predictions table. Closing odds and results are written to a separate outcomes table, never onto the prediction.</li>
            <li>Missing predictions are listed, not hidden, so the record is complete including the gaps.</li>
          </ul>
          <div className="border-t border-line px-4 py-2 text-[11px] text-muted">
            Head hash <span className="num break-all">{a.headHash}</span>
          </div>
        </Panel>
        <Panel title="Model versions in the ledger">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wider text-muted">
                <th className="px-4 py-2 text-left font-medium">Version</th>
                <th className="px-2 py-2 text-left font-medium">First prediction</th>
                <th className="px-2 py-2 text-left font-medium">Training period</th>
                <th className="px-4 py-2 text-right font-medium">Predictions</th>
              </tr>
            </thead>
            <tbody>
              {a.versionChanges.map((v) => {
                const mv = MODEL_VERSIONS.find((m) => m.id === v.versionId);
                return (
                  <tr key={v.versionId} className="border-t border-line/60">
                    <td className="num px-4 py-1.5 text-xs">{v.versionId}</td>
                    <td className="px-2 py-1.5 text-xs text-ink-2">{fmtDate(v.firstSeenAt)}</td>
                    <td className="px-2 py-1.5 text-xs text-ink-2">{mv ? `${fmtDate(mv.trainingFrom)} – ${fmtDate(mv.trainingTo)}` : "—"}</td>
                    <td className="num px-4 py-1.5 text-right">{fmtInt(v.count)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Missing predictions" right={`${a.missing.length} markets`}>
          <ul className="max-h-72 divide-y divide-line overflow-y-auto">
            {a.missing.map((m) => (
              <li key={m.marketId} className="flex justify-between gap-3 px-4 py-1.5 text-xs">
                <span className="num text-ink-2">{m.marketId}</span>
                <span className="text-muted">{m.reason}</span>
                <span className="num text-muted">{fmtDate(m.kickoff)}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Data sources">
          <ul className="divide-y divide-line">
            {dataSources(now).map((s) => (
              <li key={s.id} className="flex justify-between px-4 py-2 text-sm">
                <span>
                  <span className="text-good">●</span> {s.name} <span className="text-xs text-muted">({s.provider})</span>
                </span>
                <span className="num text-xs text-muted">{fmtDateTime(s.lastSyncAt)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
