"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SHORTCUT_ROUTES } from "./nav";

interface Command {
  id: string;
  label: string;
  hint: string;
  run: (arg: string) => void;
  takesArg?: boolean;
}

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpenState] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset transient state whenever the palette opens or closes.
  const setOpen = useCallback((next: boolean | ((o: boolean) => boolean), initialQuery = "") => {
    setOpenState((o) => {
      const value = typeof next === "function" ? next(o) : next;
      if (value !== o) {
        setQuery(value ? initialQuery : "");
        setIndex(0);
        setNotice(null);
      }
      return value;
    });
  }, []);

  const commands: Command[] = useMemo(() => {
    const go = (href: string) => () => router.push(href);
    const search = (arg: string) => router.push(`/markets?q=${encodeURIComponent(arg)}`);
    return [
      { id: "/markets", label: "Markets", hint: "Market Terminal", run: go("/markets") },
      { id: "/value", label: "Value Scanner", hint: "Scan markets by edge, EV and confidence", run: go("/value-scanner") },
      { id: "/live", label: "Live Markets", hint: "Three-pane live terminal", run: go("/live") },
      { id: "/performance", label: "Performance", hint: "Historical model performance", run: go("/performance") },
      { id: "/ledger", label: "Prediction Ledger", hint: "Every recorded prediction", run: go("/model-lab/ledger") },
      { id: "/audit", label: "Model Audit", hint: "Ledger integrity checks", run: go("/model-lab/audit") },
      { id: "/heatmap", label: "Market Heatmap", hint: "Model-market disagreement by league and market", run: go("/markets/heatmap") },
      { id: "/overview", label: "Sports Market Overview", hint: "Every sport side by side", run: go("/markets/overview") },
      { id: "/efficiency", label: "Market Efficiency", hint: "How well prices forecast results", run: go("/markets/efficiency") },
      { id: "/alerts", label: "Market Alerts", hint: "Movement, news, discrepancies, suspensions", run: go("/markets/alerts") },
      { id: "/clv", label: "Closing Line Value", hint: "Did recorded prices beat the close?", run: go("/performance/clv") },
      { id: "/replay", label: "Market Replay", hint: "Replay a finished match's market", run: go("/market-replay") },
      { id: "/matches", label: "Matches", hint: "Fixtures, live and results with what changed", run: go("/matches") },
      { id: "/lab", label: "Model Lab", hint: "Versions, backtests, errors and drift", run: go("/model-lab") },
      { id: "/errors", label: "Error Analysis", hint: "Systematic model errors", run: go("/model-lab/errors") },
      { id: "/drift", label: "Drift Monitor", hint: "Recent vs baseline performance", run: go("/model-lab/drift") },
      { id: "/backtest", label: "Backtest", hint: "Selection rules replayed over the ledger", run: go("/model-lab/backtest") },
      { id: "/search", label: "Search markets", hint: "/search Liverpool", run: search, takesArg: true },
      { id: "/analyze", label: "Analyze team", hint: "/analyze Arsenal", run: search, takesArg: true },
      { id: "/compare", label: "Compare teams", hint: "/compare Liverpool Chelsea", run: (a) => search(a.split(/\s+/)[0] ?? ""), takesArg: true },
      { id: "/watch", label: "Watch team", hint: "/watch Arsenal", run: () => setNotice("Watchlists arrive with the personal terminal (Phase 8)."), takesArg: true },
    ];
  }, [router]);

  const [cmdPart, ...argParts] = query.trim().split(/\s+/);
  const arg = argParts.join(" ");
  const filtered = commands.filter((c) => {
    if (!query.trim()) return true;
    const q = cmdPart.startsWith("/") ? cmdPart.toLowerCase() : `/${cmdPart.toLowerCase()}`;
    return c.id.startsWith(q) || c.label.toLowerCase().includes(query.trim().toLowerCase());
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        setOpen(true, "/search ");
        return;
      }
      const route = SHORTCUT_ROUTES[e.key.toLowerCase()];
      if (route) router.push(route);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, setOpen]);

  if (!open) return null;

  const execute = (c: Command | undefined) => {
    if (!c) {
      if (query.trim()) {
        router.push(`/markets?q=${encodeURIComponent(query.trim())}`);
        setOpen(false);
      }
      return;
    }
    c.run(arg);
    if (c.id !== "/watch") setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[15vh]" onClick={() => setOpen(false)}>
      <div role="dialog" aria-label="Command palette" className="w-full max-w-xl overflow-hidden rounded-lg border border-line-strong bg-surface-2 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex((i) => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              execute(filtered[index]);
            }
          }}
          placeholder="Type a command or search…  e.g. /analyze Arsenal"
          className="num w-full border-b border-line bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted"
        />
        <ul className="max-h-80 overflow-y-auto py-1">
          {filtered.map((c, i) => (
            <li key={c.id}>
              <button
                onMouseEnter={() => setIndex(i)}
                onClick={() => execute(c)}
                className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm ${i === index ? "bg-surface-3" : ""}`}
              >
                <span>
                  <span className="num text-accent">{c.id}</span> <span className="text-ink-2">{c.label}</span>
                </span>
                <span className="text-xs text-muted">{c.hint}</span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && <li className="px-4 py-3 text-sm text-muted">Press Enter to search markets for “{query.trim()}”.</li>}
        </ul>
        {notice && <div className="border-t border-line px-4 py-2 text-xs text-warning">{notice}</div>}
        <div className="flex gap-4 border-t border-line px-4 py-2 text-[11px] text-muted">
          <span>↑↓ navigate</span>
          <span>↵ run</span>
          <span>esc close</span>
          <span className="ml-auto">M V L A P W · / search</span>
        </div>
      </div>
    </div>
  );
}
