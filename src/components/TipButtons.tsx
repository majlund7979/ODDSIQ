"use client";

import { unstable_rethrow } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { dec } from "@/lib/format";
import { SAVE_FAILED } from "@/lib/save-failed";
import { SIDE_LABEL, SIDES, type Side } from "@/lib/tips";

/** The 1, X and 2 buttons for one match. The choice shows at once and is saved in the background; when saving fails it reverts and says why. */
export function TipButtons({
  action,
  eventId,
  pick,
  odds,
  model,
  locked,
  started = false,
  result,
}: {
  action: (formData: FormData) => Promise<{ error?: string }>;
  eventId: string;
  pick: Side | null;
  odds: Record<Side, number | null>;
  model: Record<Side, number> | null;
  locked: boolean;
  /** The match has kicked off: its live odds can no longer be used, so they are not shown. */
  started?: boolean;
  result: Side | null;
}) {
  const [shown, setShown] = useOptimistic(pick);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const choose = (side: Side) => {
    setError(null);
    start(async () => {
      setShown(side);
      const fd = new FormData();
      fd.set("eventId", eventId);
      fd.set("pick", side);
      try {
        setError((await action(fd)).error ?? null);
      } catch (e) {
        unstable_rethrow(e);
        setError(SAVE_FAILED);
      }
    });
  };

  return (
    <>
      <div className="grid grid-cols-3 gap-2" aria-busy={pending}>
        {SIDES.map((s) => {
          const mine = shown === s;
          const right = result === s;
          const tone = result
            ? right
              ? "border-good bg-good/15 text-good"
              : mine
                ? "border-critical/60 bg-critical/10 text-critical"
                : "border-line bg-surface-2 text-ink-2"
            : mine
              ? "border-accent bg-accent text-on-accent shadow-[var(--shadow-glow)]"
              : locked
                ? "border-line bg-surface-2 text-ink-2"
                : "border-line-strong bg-surface-2 text-ink hover:-translate-y-px hover:border-accent/70 hover:bg-surface-3";
          return (
            <button
              key={s}
              type="button"
              disabled={locked}
              onClick={() => choose(s)}
              aria-pressed={mine}
              aria-label={`Tip ${SIDE_LABEL[s]}${odds[s] && !started ? `, odds ${dec(odds[s]!)}` : ""}`}
              className={`flex min-h-16 flex-col items-center justify-center rounded-field border px-2 py-2 transition-[background-color,border-color,translate,box-shadow] duration-150 active:scale-[0.97] disabled:cursor-default ${tone}`}
            >
              <span className="figure text-xl">{SIDE_LABEL[s]}</span>
              {!started && (
                <>
                  <span className={`num mt-1 text-sm font-semibold ${mine && !result ? "text-on-accent" : ""}`}>{odds[s] ? dec(odds[s]!) : "—"}</span>
                  {model && <span className={`num text-xs ${mine && !result ? "text-on-accent/75" : "text-ink-2"}`}>{Math.round(model[s] * 100)}&nbsp;%</span>}
                </>
              )}
            </button>
          );
        })}
      </div>
      {error && (
        <p role="status" className="mt-2 text-xs text-critical">
          {error}
        </p>
      )}
    </>
  );
}
