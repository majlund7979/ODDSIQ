import Link from "next/link";
import type { ReactNode } from "react";

/** The mark: the centre circle and halfway line of a pitch, seen from above, on the hi-vis signal colour. */
export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={`shrink-0 ${className}`} aria-hidden>
      <rect width="64" height="64" rx="16" fill="var(--accent)" />
      <path d="M8 32h48" stroke="var(--on-accent)" strokeWidth="4" strokeLinecap="round" />
      <circle cx="32" cy="32" r="13" fill="none" stroke="var(--on-accent)" strokeWidth="4" />
      <circle cx="32" cy="32" r="4" fill="var(--on-accent)" />
    </svg>
  );
}

/** The brand, linking to /picks; the whole block is clickable. A `badge` (the DEMO DATA label) sits beside the name, outside the link text. */
export function Logo({ badge }: { badge?: ReactNode }) {
  return (
    <div className="group relative flex min-w-0 items-center gap-2.5">
      <LogoMark className="h-9 w-9 transition-transform duration-300 ease-[var(--ease-out)] group-hover:rotate-90" />
      <div className="flex min-w-0 flex-col items-start leading-none sm:flex-row sm:items-center sm:gap-2.5">
        <Link
          href="/picks"
          className="display text-[22px] leading-none tracking-[-0.01em] text-ink after:absolute after:inset-0 after:rounded-field focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-4 focus-visible:after:outline-accent"
        >
          Oddsanalyse
        </Link>
        {badge && <span className="mt-1 sm:mt-0">{badge}</span>}
      </div>
    </div>
  );
}
