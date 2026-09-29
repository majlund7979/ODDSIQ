"use client";

import { useSyncExternalStore } from "react";
import { fmtAgo } from "@/lib/format";

function subscribe(onTick: () => void) {
  const id = setInterval(onTick, 1000);
  return () => clearInterval(id);
}

/** Current time, ticking each second on the client; null during server render. */
function useNow(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / 1000) * 1000,
    () => null,
  );
}

export function UtcClock() {
  const now = useNow();
  return (
    <span className="num text-xs text-ink-2" suppressHydrationWarning>
      {now ? new Date(now).toISOString().slice(11, 19) : "--:--:--"} UTC
    </span>
  );
}

/** "12 seconds ago", ticking on the client from a server timestamp. */
export function Ago({ at }: { at: number }) {
  const now = useNow();
  return <span className="num">{now ? fmtAgo(now - at) : "—"}</span>;
}
