"use client";

import { useState } from "react";
import { setBankroll, useBankroll } from "./bankroll";

/** "Din pulje": the amount the stake suggestions are a share of. */
export function BankrollInput() {
  const bankroll = useBankroll();
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const n = Number((draft ?? "").replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(n) && n >= 10 && n <= 10_000_000) setBankroll(Math.round(n));
    setDraft(null);
  };
  return (
    <label className="flex items-center gap-2 text-sm font-medium text-ink-2">
      Din pulje
      <input
        inputMode="numeric"
        value={draft ?? String(bankroll)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        className="num min-h-11 w-28 rounded-field border border-line-strong bg-page px-3 text-right text-md text-ink outline-none transition-[border-color,box-shadow] focus:border-accent focus:ring-4 focus:ring-accent-fill sm:min-h-10"
        aria-label="Din pulje i kroner"
      />
      kr
    </label>
  );
}
