import type { ReactNode } from "react";

export function Panel({ title, right, children, className = "", id }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`scroll-mt-4 min-w-0 overflow-hidden rounded-[20px] border border-line bg-surface ${className}`}>
      {(title || right) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-bold text-ink">{title}</h2>
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
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${toneClass[tone]} ${className}`}>
      {children}
    </span>
  );
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
