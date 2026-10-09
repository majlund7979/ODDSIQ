import Link from "next/link";
import type { ReactNode } from "react";

/** The brand, linking to /picks; the whole block is clickable. A `badge` (the DEMO DATA label) sits under the name, outside the link text. */
export function Logo({ badge }: { badge?: ReactNode }) {
  return (
    <div className="relative flex items-center gap-2">
      <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-[17px] font-extrabold text-white">
        $
      </span>
      <div className="flex flex-col items-start">
        <Link href="/picks" className="text-[19px] font-extrabold leading-tight tracking-[-0.02em] text-ink after:absolute after:inset-0">
          Oddsanalyse
        </Link>
        {badge}
      </div>
    </div>
  );
}
