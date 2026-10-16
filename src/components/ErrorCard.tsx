"use client";

import Link from "next/link";
import { buttonClass } from "./ui";

/** What error.tsx shows when a page could not be loaded: try again, or go back to the picks. */
export function ErrorCard({ retry }: { retry: () => void }) {
  return (
    <div role="alert" className="rise mx-auto w-full max-w-sm rounded-sheet border border-line bg-surface p-6 shadow-[var(--shadow-pop)] sm:p-7">
      <div className="eyebrow text-serious">Fejl</div>
      <h1 className="mt-2 text-2xl font-bold tracking-[-0.01em] text-ink">Noget gik galt</h1>
      <p className="mt-2 mb-6 text-sm text-ink-2">Siden kunne ikke hentes lige nu.</p>
      <button type="button" onClick={() => retry()} className={buttonClass("primary", "lg", "w-full")}>
        Prøv igen
      </button>
      <Link href="/picks" className="mt-3 flex min-h-11 items-center justify-center text-sm text-ink-2 hover:text-accent">
        Til dagens bedste bets
      </Link>
    </div>
  );
}
