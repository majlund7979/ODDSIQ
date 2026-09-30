import Link from "next/link";
import type { ReactNode } from "react";
import type { Metric } from "@/lib/metrics/metric";
import { fmtInt, fmtPeriod } from "@/lib/format";

export function Panel({ title, right, children, className = "", id }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`scroll-mt-4 min-w-0 rounded-md border border-line bg-surface ${className}`}>
      {(title || right) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-2">{title}</h2>
          {right && <div className="text-xs text-muted">{right}</div>}
        </header>
      )}
      <div>{children}</div>
    </section>
  );
}

type Tone = "neutral" | "good" | "warning" | "serious" | "critical" | "accent";

const toneClass: Record<Tone, string> = {
  neutral: "border-line-strong text-ink-2",
  good: "border-good/50 text-good",
  warning: "border-warning/50 text-warning",
  serious: "border-serious/50 text-serious",
  critical: "border-critical/60 text-critical",
  accent: "border-accent/50 text-accent",
};

export function Badge({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider ${toneClass[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function levelTone(level: string): Tone {
  if (level === "HIGH") return "serious";
  if (level === "ELEVATED" || level === "MODERATE") return "warning";
  return "neutral";
}

/** Inline definition tooltip (hover or keyboard focus). */
export function Tip({ children, text }: { children: ReactNode; text: ReactNode }) {
  return (
    <span className="tip inline-flex cursor-help items-center gap-1" tabIndex={0}>
      {children}
      <span aria-hidden className="text-[10px] text-muted">ⓘ</span>
      <span role="tooltip" className="tip-body">
        {text}
      </span>
    </span>
  );
}

/** Signed value coloured by direction, with the sign always visible. */
export function Signed({ value, children }: { value: number | null | undefined; children: ReactNode }) {
  const cls = value == null || Number.isNaN(value) || Math.abs(value) < 1e-9 ? "text-ink-2" : value > 0 ? "text-good" : "text-critical";
  return <span className={`num ${cls}`}>{children}</span>;
}

/** Context line that must accompany every aggregate statistic. */
export function MetricContextLine({ m, className = "" }: { m: Metric<unknown>; className?: string }) {
  const basis = m.basis === "simulated" ? "Simulated" : m.basis === "historical" ? "Historical" : m.basis === "estimated" ? "Estimated" : "Live";
  return (
    <p className={`text-[11px] leading-relaxed text-muted ${className}`}>
      <span className="text-ink-2">{basis}</span> · n = {fmtInt(m.n)} · {fmtPeriod(m.periodFrom, m.periodTo)}
      {m.modelVersion && <> · {m.modelVersion}</>}
    </p>
  );
}

export function StatTile({ label, value, m, hint }: { label: string; value: ReactNode; m?: Metric<unknown>; hint?: ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-surface px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        {m ? <Tip text={m.definition}>{label}</Tip> : label}
      </div>
      <div className="mt-1.5 text-2xl font-medium">{value}</div>
      {m ? <MetricContextLine m={m} className="mt-1" /> : hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
      <div>
        <h1 className="text-lg font-semibold tracking-[0.08em] uppercase">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-ink-2">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

/** Link-based segmented control; state lives in the URL so views are shareable. */
export function LinkTabs({ items, active, label }: { items: { id: string; label: string; href: string }[]; active: string; label: string }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-1">
      {items.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          scroll={false}
          aria-current={t.id === active ? "page" : undefined}
          className={`rounded px-2 py-1 text-xs ${t.id === active ? "bg-surface-3 text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
