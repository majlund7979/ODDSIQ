import { Badge, PageHeader, Panel, Signed } from "@/components/ui";
import { scanErrorPatterns, type ErrorPattern } from "@/lib/demo/analytics";

import { fmtInt, fmtPct, fmtPeriod, fmtPp, fmtSignedPct } from "@/lib/format";
import { terminal } from "@/lib/terminal";

export const metadata = { title: "Error Analysis · ODDSIQ" };

function pFmt(p: number) {
  return p < 0.0001 ? "p < 0.0001" : `p = ${p.toFixed(4)}`;
}

function PatternCard({ p }: { p: ErrorPattern }) {
  const s = p.segment;
  return (
    <Panel
      title={
        <span className="normal-case tracking-normal">
          {s.label} <span className="text-muted">·</span> model {p.direction}
        </span>
      }
      right={<Badge tone="warning">{fmtPp(s.biasPp)}</Badge>}
    >
      <div className="grid gap-0 lg:grid-cols-2">
        <div className="border-b border-line px-4 py-3 lg:border-r lg:border-b-0">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-2">Known facts</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            <li>
              Across <span className="num">{fmtInt(s.n)}</span> settled predictions the model averaged <span className="num">{fmtPct(s.meanPredicted)}</span>; these selections won{" "}
              <span className="num">{fmtPct(s.hitRate)}</span> of the time.
            </li>
            <li>
              Gap <span className="num">{fmtPp(s.biasPp)}</span>, z = <span className="num">{s.biasZ.toFixed(2)}</span>, <span className="num">{pFmt(p.pValue)}</span>.
            </li>
            <li>
              Brier <span className="num">{s.brier.toFixed(3)}</span> vs closing market <span className="num">{s.marketBrier.toFixed(3)}</span> on the same predictions.
            </li>
            <li>
              Average CLV <Signed value={s.avgClv}>{fmtSignedPct(s.avgClv)}</Signed> (n = {fmtInt(s.clvN)}). Simulated flat stake on every prediction in the segment: <Signed value={p.allStakes.roi}>{fmtSignedPct(p.allStakes.roi)}</Signed> ROI.
            </li>
            <li className="text-ink-2">Period {fmtPeriod(s.periodFrom, s.periodTo)}.</li>
          </ul>
          <table className="mt-3 w-full text-[12px]">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wider text-muted">
                <th className="py-1 text-left font-medium">Version</th>
                <th className="py-1 text-right font-medium">n</th>
                <th className="py-1 text-right font-medium">Gap</th>
              </tr>
            </thead>
            <tbody>
              {p.byVersion.map((v) => (
                <tr key={v.versionId} className="border-t border-line/60">
                  <td className="num py-1">{v.versionId}</td>
                  <td className="num py-1 text-right">{fmtInt(v.n)}</td>
                  <td className="num py-1 text-right">{fmtPp(v.biasPp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-2">Possible explanations</h3>
          <p className="mt-1 text-[11px] text-muted">Hypotheses to investigate, not verified causes.</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm text-ink-2">
            {p.possibleExplanations.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  );
}

export default async function ErrorsPage() {
  const t = await terminal();
  const scan = scanErrorPatterns(t.ledgerRows());
  return (
    <div className="space-y-5">
      <PageHeader
        title="Error Analysis"
        subtitle="Where the model is systematically wrong. Segments are tested only with enough data, and reported only when the gap is too large to be explained by chance across all the segments tested."
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Settled predictions scanned", value: fmtInt(scan.settled), note: fmtPeriod(scan.periodFrom, scan.periodTo) },
          { label: "Segments tested", value: fmtInt(scan.segmentsTested), note: `Each with n ≥ ${scan.minSample}` },
          { label: "Too small to test", value: fmtInt(scan.segmentsBelowMinimum), note: `Segments with n < ${scan.minSample}, never reported` },
          { label: "Significance bar", value: `|z| ≥ ${scan.criticalZ.toFixed(2)}`, note: "5% family-wise error, Bonferroni-corrected" },
        ].map((t) => (
          <div key={t.label} className="rounded-md border border-line bg-surface px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{t.label}</div>
            <div className="num mt-1.5 text-2xl">{t.value}</div>
            <p className="mt-1 text-[11px] text-muted">{t.note}</p>
          </div>
        ))}
      </div>

      {scan.patterns.length === 0 ? (
        <Panel>
          <p className="px-4 py-6 text-sm text-ink-2">No segment clears the significance bar. That does not prove the model is unbiased everywhere; smaller effects may exist that this sample cannot detect.</p>
        </Panel>
      ) : (
        scan.patterns.map((p) => <PatternCard key={p.segment.key} p={p} />)
      )}

      <Panel title="Method">
        <ul className="list-disc space-y-1.5 py-3 pr-4 pl-8 text-sm text-ink-2">
          <li>Segments are fixed combinations of selection type, league, odds range, market and confidence band, chosen before looking at results.</li>
          <li>The gap is observed win rate minus mean predicted probability. Its z-score divides by the standard error implied by the model&apos;s own probabilities.</li>
          <li>Because many segments are tested at once, the bar is raised with a Bonferroni correction so that the chance of any false report stays near 5%.</li>
          <li>Related segments overlap: a pattern in one selection type also appears in its narrower sub-segments. In a market whose probabilities sum to 100%, overestimating one outcome means underestimating another.</li>
        </ul>
        <p className="border-t border-line px-4 py-2 text-[11px] text-muted">Historical · Source: {t.ledgerSource}</p>
      </Panel>
    </div>
  );
}
