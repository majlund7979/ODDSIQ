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
    <label className="flex items-center gap-2 text-sm text-ink-2">
      Din pulje
      <input
        inputMode="numeric"
        value={draft ?? String(bankroll)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        className="num w-24 rounded-[10px] border border-line-strong bg-surface px-2 py-1 text-right text-ink"
        aria-label="Din pulje i kroner"
      />
      kr
    </label>
  );
}
