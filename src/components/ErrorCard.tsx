"use client";

import Link from "next/link";

/** What error.tsx shows when a page could not be loaded: try again, or go back to the picks. */
export function ErrorCard({ retry }: { retry: () => void }) {
  return (
    <div role="alert" className="mx-auto w-full max-w-sm rounded-[28px] border border-line bg-surface p-6">
      <h1 className="text-lg font-semibold text-ink">Noget gik galt</h1>
      <p className="mt-1 mb-5 text-sm text-ink-2">Siden kunne ikke hentes lige nu.</p>
      <button type="button" onClick={() => retry()} className="w-full rounded-full bg-lime px-3 py-3 text-[16px] font-semibold text-accent transition-colors hover:brightness-125">
        Prøv igen
      </button>
      <Link href="/picks" className="mt-4 block text-center text-sm text-ink-2 hover:text-accent">
        Til dagens bedste bets
      </Link>
    </div>
  );
}
