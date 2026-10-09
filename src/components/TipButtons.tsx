"use client";

import { useOptimistic, useTransition } from "react";
import { dec } from "@/lib/format";
import { SIDE_LABEL, SIDES, type Side } from "@/lib/tips";

/** The 1, X and 2 buttons for one match. The choice shows at once and is saved in the background. */
export function TipButtons({
  action,
  eventId,
  pick,
  odds,
  model,
  locked,
  result,
}: {
  action: (formData: FormData) => Promise<void>;
  eventId: string;
  pick: Side | null;
  odds: Record<Side, number | null>;
  model: Record<Side, number> | null;
  locked: boolean;
  result: Side | null;
}) {
  const [shown, setShown] = useOptimistic(pick);
  const [pending, start] = useTransition();

  const choose = (side: Side) =>
    start(async () => {
      setShown(side);
      const fd = new FormData();
      fd.set("eventId", eventId);
      fd.set("pick", side);
      await action(fd);
    });

  return (
    <div className="grid grid-cols-3 gap-2" aria-busy={pending}>
      {SIDES.map((s) => {
        const mine = shown === s;
        const right = result === s;
        const tone = result
          ? right
            ? "border-good bg-good/15 text-good"
            : mine
              ? "border-critical/60 bg-critical/10 text-critical"
              : "border-line bg-surface-2 text-muted"
          : mine
            ? "border-accent bg-accent text-page"
            : locked
              ? "border-line bg-surface-2 text-muted"
              : "border-line-strong bg-surface-2 text-ink hover:border-accent";
        return (
          <button
            key={s}
            type="button"
            disabled={locked}
            onClick={() => choose(s)}
            aria-pressed={mine}
            aria-label={`Tip ${SIDE_LABEL[s]}${odds[s] ? `, odds ${dec(odds[s]!)}` : ""}`}
            className={`flex flex-col items-center rounded-xl border px-2 py-2 transition-colors disabled:cursor-default ${tone}`}
          >
            <span className="text-lg leading-none font-bold">{SIDE_LABEL[s]}</span>
            <span className={`num mt-1 text-xs ${mine && !result ? "text-page/80" : ""}`}>{odds[s] ? dec(odds[s]!) : "—"}</span>
            {model && <span className={`num text-[10px] ${mine && !result ? "text-page/70" : "text-muted"}`}>{Math.round(model[s] * 100)} %</span>}
          </button>
        );
      })}
    </div>
  );
}
