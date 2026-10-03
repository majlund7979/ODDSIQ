"use client";

import { useEffect, useRef, useState } from "react";
import type { NewsItem } from "@/lib/news/news";
import { NewsList } from "./NewsList";

/**
 * Headlines about the two teams. Loaded only when the analysis around it is
 * opened, so the picks page itself never waits on the news feed.
 */
export function TeamNews({ home, away }: { home: string; away: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ now: number; items: NewsItem[] } | "idle" | "loading" | "error">("idle");

  useEffect(() => {
    const details = ref.current?.closest("details");
    let started = false;
    const load = () => {
      if (started || (details && !details.open)) return;
      started = true;
      setState("loading");
      fetch(`/api/news?${new URLSearchParams({ home, away })}`)
        .then((r) => r.json())
        .then((d: { now?: number; items?: NewsItem[] }) => setState({ now: d.now ?? Date.now(), items: d.items ?? [] }))
        .catch(() => setState("error"));
    };
    load();
    details?.addEventListener("toggle", load);
    return () => details?.removeEventListener("toggle", load);
  }, [home, away]);

  return (
    <div ref={ref}>
      {typeof state === "object" ? (
        state.items.length ? (
          <NewsList items={state.items} now={state.now} compact />
        ) : (
          <p className="text-sm text-muted">Ingen nyheder om holdene den seneste uge.</p>
        )
      ) : (
        <p className="text-sm text-muted">{state === "error" ? "Nyhederne kunne ikke hentes lige nu." : "Henter nyheder…"}</p>
      )}
    </div>
  );
}
