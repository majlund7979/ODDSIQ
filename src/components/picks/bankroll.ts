"use client";

// The bankroll lives in this browser only (localStorage): it is a personal
// convenience for the stake suggestions, not account data.

import { useSyncExternalStore } from "react";
import { DEFAULT_BANKROLL } from "@/lib/picks-advice";

const KEY = "oddsiq-bankroll";
const EVENT = "oddsiq-bankroll";

function read(): number {
  try {
    const v = Number(window.localStorage.getItem(KEY));
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_BANKROLL;
  } catch {
    return DEFAULT_BANKROLL;
  }
}

export function setBankroll(kr: number) {
  try {
    window.localStorage.setItem(KEY, String(kr));
  } catch {
    // Storage blocked: the suggestion falls back to the default bankroll.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useBankroll(): number {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_BANKROLL);
}
