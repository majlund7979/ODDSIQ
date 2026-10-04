"use client";

// "Læg Oddsanalyse på hjemmeskærmen": a button where the browser offers
// installing (Chrome, Edge, Android), otherwise the steps for iPhone.

import { useEffect, useState, useSyncExternalStore } from "react";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
}

const STANDALONE = "(display-mode: standalone)";
const subscribeStandalone = (cb: () => void) => {
  const q = window.matchMedia(STANDALONE);
  q.addEventListener("change", cb);
  return () => q.removeEventListener("change", cb);
};

export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [justInstalled, setInstalled] = useState(false);
  const standalone = useSyncExternalStore(subscribeStandalone, () => window.matchMedia(STANDALONE).matches, () => false);
  const installed = standalone || justInstalled;
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  if (installed) return <p className="text-sm text-ink-2">Oddsanalyse er lagt på din hjemmeskærm.</p>;
  if (prompt)
    return (
      <button type="button" onClick={() => prompt.prompt().then(() => setPrompt(null))} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-page">
        Læg på hjemmeskærmen
      </button>
    );
  return (
    <p className="text-sm text-ink-2">
      iPhone: tryk på Del-knappen i Safari og vælg &quot;Føj til hjemmeskærm&quot;. Android: åbn menuen i Chrome og vælg &quot;Installer app&quot;.
    </p>
  );
}
