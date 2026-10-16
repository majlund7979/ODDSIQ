import Link from "next/link";
import type { ReactNode } from "react";
import { TZ } from "@/lib/format";
import type { Metric } from "@/lib/metrics/metric";

// The shared building blocks. Pages compose these instead of re-typing card, button and tab classes, so the radii,
// borders, sizes and states stay the same everywhere.

/* ---------- Surfaces ---------- */

/** A card's classes, for the places that need them on another element (an <a>, an <article>, a <details>). */
export function cardClass({ interactive = false, tone = "plain" }: { interactive?: boolean; tone?: "plain" | "raised" | "signal" } = {}) {
  const base = "min-w-0 rounded-card border";
  const toneClass = tone === "signal" ? "border-accent/30 bg-accent-soft" : tone === "raised" ? "border-line bg-surface-2" : "border-line bg-surface";
  const hover = interactive ? " transition-[border-color,background-color,translate] duration-200 hover:border-line-strong hover:bg-surface-2 active:translate-y-px" : "";
  return `${base} ${toneClass}${hover}`;
}

export function Panel({ title, right, children, className = "", id }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`scroll-mt-4 overflow-hidden ${cardClass()} ${className}`}>
      {(title || right) && (
        <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line px-5 py-3.5">
          <h2 className="text-md font-semibold text-ink">{title}</h2>
          {right && <div className="text-xs text-muted">{right}</div>}
        </header>
      )}
      <div>{children}</div>
    </section>
  );
}

/** The top of a page: an eyebrow (date or back link), the condensed headline, a short intro, and optional extras. */
export function PageHeader({
  eyebrow,
  back,
  title,
  intro,
  aside,
  children,
  className = "",
}: {
  eyebrow?: ReactNode;
  back?: { href: string; label: string };
  title: ReactNode;
  intro?: ReactNode;
  /** Shown to the right of the headline from 1024 px, under it on phones. */
  aside?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`rise grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-10 ${className}`}>
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="group -ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-field px-1 text-sm font-medium text-ink-2 hover:text-ink">
            <span aria-hidden className="transition-transform group-hover:-translate-x-0.5">
              ←
            </span>
            {back.label}
          </Link>
        )}
        {eyebrow && <div className="eyebrow mb-3">{eyebrow}</div>}
        <h1 className="display text-[44px] text-ink sm:text-[64px] lg:text-[76px]">{title}</h1>
        {intro && <div className="mt-4 max-w-[60ch] text-md leading-relaxed text-ink-2 sm:text-lg sm:leading-relaxed">{intro}</div>}
        {children}
      </div>
      {aside && <div className="min-w-0">{aside}</div>}
    </header>
  );
}

/** The one empty state: a short headline and a sentence on why, with an optional action. */
export function EmptyState({ title, text, action, className = "" }: { title: string; text?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={`rounded-card border border-dashed border-line-strong px-6 py-10 text-center ${className}`}>
      <svg viewBox="0 0 48 48" className="mx-auto mb-4 h-10 w-10 text-line-strong" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="24" cy="24" r="10" />
        <path d="M2 24h44" strokeLinecap="round" />
      </svg>
      <div className="text-lg font-semibold text-ink">{title}</div>
      {text && <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-2">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** A one-line message in the flow of the page: a saved bet, a warning, a quiet "nothing today". */
export function Notice({ tone = "neutral", children, className = "", role }: { tone?: "neutral" | "good" | "warning"; children: ReactNode; className?: string; role?: "status" | "alert" }) {
  const t = tone === "good" ? "border-good/35 bg-good/10 text-ink" : tone === "warning" ? "border-warning/35 bg-warning/10 text-ink" : "border-line bg-surface-2 text-ink-2";
  const dot = tone === "good" ? "bg-good" : tone === "warning" ? "bg-warning" : "bg-muted";
  return (
    <div role={role} className={`flex items-start gap-3 rounded-card border px-4 py-3 text-sm leading-relaxed ${t} ${className}`}>
      <span aria-hidden className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* ---------- Actions ---------- */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "quiet";
export type ButtonSize = "sm" | "md" | "lg";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:brightness-110 hover:shadow-[var(--shadow-glow)] disabled:hover:shadow-none",
  secondary: "border border-line-strong bg-surface-2 text-ink hover:border-accent/50 hover:bg-surface-3",
  ghost: "border border-accent/35 text-accent hover:bg-accent-fill",
  quiet: "text-ink-2 hover:bg-surface-2 hover:text-ink",
};
const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-11 px-4 text-sm",
  lg: "min-h-12 px-5 text-base",
};

/** A button's classes, for <button>, <Link> and <a> alike. Every size is a comfortable touch target on phones (sm grows to 44 px there). */
export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra = "") {
  const touch = size === "sm" ? "max-sm:min-h-11" : "";
  return `inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-field font-semibold transition-[background-color,border-color,color,box-shadow,filter,scale] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_VARIANT[variant]} ${BUTTON_SIZE[size]} ${touch} ${extra}`;
}

/* ---------- Fields ---------- */

/** A text field's classes. Invalid fields (aria-invalid) turn red. */
export const fieldBase =
  "min-h-12 w-full rounded-field border border-line-strong bg-page px-3.5 py-3 text-base text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted hover:border-ink-2/40 focus:border-accent focus:ring-4 focus:ring-accent-fill aria-[invalid=true]:border-critical aria-[invalid=true]:ring-critical/20 sm:text-md";
/** A field under its label text. */
export const fieldClass = `mt-1.5 ${fieldBase}`;

/* ---------- Choosing ---------- */

/** One option in a segmented control (Top 5 / Top 10, Log ind / Opret konto). Put it inside `segmentedGroup`. */
export function segmentClass(active: boolean, extra = "") {
  return `relative flex min-h-11 flex-1 items-center justify-center whitespace-nowrap rounded-[8px] px-4 text-sm font-semibold transition-colors duration-150 sm:min-h-9 ${
    active ? "bg-accent text-on-accent shadow-[0_1px_0_rgba(255,255,255,0.25)_inset]" : "text-ink-2 hover:bg-surface-3 hover:text-ink"
  } ${extra}`;
}
export const segmentedGroup = "flex gap-1 rounded-field border border-line bg-surface-2 p-1";

/** A filter chip (bet types). Active chips carry the signal colour. */
export function chipClass(active: boolean, extra = "") {
  return `relative inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors duration-150 sm:min-h-10 ${
    active ? "border-accent/60 bg-accent-fill font-semibold text-accent" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink"
  } ${extra}`;
}

/* ---------- Labels ---------- */

type Tone = "neutral" | "good" | "warning" | "serious" | "critical" | "accent";

const toneClass: Record<Tone, string> = {
  neutral: "border-line-strong text-ink-2",
  good: "border-good/45 bg-good/10 text-good",
  warning: "border-warning/45 bg-warning/10 text-warning",
  serious: "border-serious/45 bg-serious/10 text-serious",
  critical: "border-critical/50 bg-critical/10 text-critical",
  accent: "border-accent/45 bg-accent-soft text-accent",
};

export function Badge({ children, tone = "neutral", className = "", title }: { children: ReactNode; tone?: Tone; className?: string; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold leading-4 ${toneClass[tone]} ${className}`}>
      {children}
    </span>
  );
}

const BASIS: Record<Metric["basis"], string> = { historical: "Historisk", simulated: "Simuleret", live: "Live", estimated: "Skøn" };
const MONTH = (t: number | null) => (t == null ? "—" : new Date(t).toLocaleDateString("da-DK", { month: "short", year: "numeric", timeZone: TZ }));

/** The context every aggregate statistic carries: basis, sample size, period, model version and source. */
export function MetricContextLine({ m }: { m: Metric<unknown> }) {
  return (
    <p className="mt-1 text-xs leading-relaxed text-ink-2">
      <span className="font-semibold text-ink">{BASIS[m.basis]}</span> · n = {m.n.toLocaleString("da-DK")} · {MONTH(m.periodFrom)} – {MONTH(m.periodTo)} ·{" "}
      {m.modelVersion} · {m.source}
    </p>
  );
}

/** Inline definition tooltip (hover or keyboard focus). */
export function Tip({ children, text }: { children: ReactNode; text: ReactNode }) {
  return (
    <span className="tip inline-flex cursor-help items-center gap-1 rounded-[4px]" tabIndex={0}>
      {children}
      <span aria-hidden className="text-xs text-muted">
        ⓘ
      </span>
      <span role="tooltip" className="tip-body">
        {text}
      </span>
    </span>
  );
}
