import Link from "next/link";
import { ACCOUNTS_ENABLED } from "@/lib/auth/session";
import { PLANS } from "@/lib/billing/plans";
import { fmtInt, fmtMonth, fmtPct, fmtSignedPct } from "@/lib/format";
import { DEMO_MODE } from "@/lib/data";
import { terminal } from "@/lib/terminal";
import { mean } from "@/lib/metrics/stats";

export const metadata = { title: "ODDSIQ · See the numbers behind the odds" };

const PILLARS = [
  { title: "Market movement", text: "Every price as a time series across tracked bookmakers, with velocity, estimated market pressure and a “What changed?” timeline.", href: "/markets" },
  { title: "Model vs market", text: "The model's probability next to the margin-free market price, with the difference in percentage points and how much the component models agree.", href: "/value-scanner" },
  { title: "Uncertainty, not false precision", text: "Every estimate carries an uncertainty range, and disagreement between models lowers confidence automatically.", href: "/model-lab" },
  { title: "Measured performance", text: "Brier score, calibration and closing line value, each with its sample size, period and model version.", href: "/performance" },
];

const RECORD = ["Timestamp", "Odds", "Probability", "Model version", "Confidence", "Closing price", "Result"];

export default async function LandingPage() {
  const t = await terminal();
  const audit = t.ledgerAudit();
  const rows = t.ledgerRows().filter((r) => r.clv !== undefined);
  const avgClv = rows.length ? mean(rows.map((r) => r.clv!)) : NaN;
  const positive = rows.length ? rows.filter((r) => r.clv! > 0).length / rows.length : NaN;

  return (
    <div>
      <section className="border-b border-line">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">ODDSIQ</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">See the numbers behind the odds.</h1>
          <p className="mt-5 max-w-2xl text-lg text-ink-2">Track market movement. Compare probabilities. Understand model disagreement. Measure performance.</p>
          <p className="mt-2 text-sm text-muted">An AI-powered sports market intelligence platform.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/picks" className="rounded bg-accent px-4 py-2.5 text-sm font-medium text-page">
              Se dagens bedste bets
            </Link>
            {ACCOUNTS_ENABLED && (
              <Link href="/signup" className="rounded border border-line-strong px-4 py-2.5 text-sm hover:bg-surface-2">
                Create a free account
              </Link>
            )}
            <Link href="/model-lab/ledger" className="rounded px-4 py-2.5 text-sm text-ink-2 hover:text-ink">
              See every prediction →
            </Link>
          </div>
        </div>
      </section>

      <section className="border-b border-line">
        <div className="mx-auto grid max-w-6xl gap-px bg-line px-0 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((p) => (
            <Link key={p.title} href={p.href} className="bg-page px-5 py-8 hover:bg-surface">
              <h2 className="text-sm font-semibold">{p.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{p.text}</p>
            </Link>
          ))}
        </div>
      </section>

      <section id="accountability" className="scroll-mt-4 border-b border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Accountability</p>
            <h2 className="mt-3 text-2xl font-semibold">Every prediction is recorded before the match, and can never be edited.</h2>
            <p className="mt-4 text-ink-2">
              You judge the model on its complete record, not on selected winners. Each prediction is written to a hash-chained ledger that the database refuses to change or delete. Closing prices and results are added alongside it, never over it.
            </p>
            <ul className="mt-5 flex flex-wrap gap-2">
              {RECORD.map((r) => (
                <li key={r} className="rounded border border-line px-2 py-1 text-xs text-ink-2">
                  {r}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-md border border-line bg-surface">
            <dl className="grid grid-cols-2 gap-px bg-line">
              {[
                ["Predictions in the ledger", fmtInt(audit.count)],
                ["Hash chain", audit.verification.ok ? "Verified" : "Broken"],
                ["Changed or deleted", `${audit.changed + audit.deleted}`],
                ["Average CLV", rows.length ? fmtSignedPct(avgClv) : "No closed predictions yet"],
              ].map(([k, v]) => (
                <div key={k} className="bg-surface px-5 py-5">
                  <dt className="text-[10.5px] uppercase tracking-[0.12em] text-muted">{k}</dt>
                  <dd className="num mt-1 text-2xl">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="border-t border-line px-5 py-3 text-[11px] leading-relaxed text-muted">
              {DEMO_MODE ? "DEMO DATA. " : ""}Historical · ledger {fmtMonth(audit.firstAt)} – {fmtMonth(audit.lastAt)} · CLV n = {fmtInt(rows.length)}, {fmtPct(positive, 0)} positive. Positive CLV over a large sample is associated with long-run edge but guarantees nothing about any single result.
            </p>
          </div>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-4">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Pricing</p>
          <h2 className="mt-3 text-2xl font-semibold">Start free. Upgrade when live prices matter.</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {PLANS.map((p) => (
              <div key={p.id} className={`rounded-md border bg-surface p-6 ${p.id === "pro" ? "border-accent/50" : "border-line"}`}>
                <div className="flex items-baseline justify-between">
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                  <span className="num text-ink-2">{p.priceLabel}</span>
                </div>
                <p className="mt-2 text-sm text-ink-2">{p.summary}</p>
                <ul className="mt-4 space-y-1.5 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span className="text-accent">·</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href={p.id === "free" ? "/picks" : ACCOUNTS_ENABLED ? "/signup?next=/account" : "/picks"} className="mt-6 inline-block rounded border border-line-strong px-3 py-1.5 text-sm hover:bg-surface-2">
                  {p.id === "free" ? "Open the terminal" : ACCOUNTS_ENABLED ? "Create account" : "Coming soon"}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
