"use client";

// "Din kupon": the bets a visitor picks for their own coupon. Kept in this
// browser only (localStorage), like the bankroll; it is a convenience, not account data.

import { useSyncExternalStore } from "react";

export interface Leg {
  key: string;
  eventId: string;
  match: string;
  outcome: string;
  probability: number;
  odds: number | null;
  kickoff: number;
}

const KEY = "oddsiq-kupon";
const EVENT = "oddsiq-kupon";
export const MAX_LEGS = 5;
const EMPTY: Leg[] = [];
let cached: { raw: string | null; legs: Leg[] } = { raw: null, legs: EMPTY };

function read(): Leg[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === cached.raw) return cached.legs;
    const legs = raw ? (JSON.parse(raw) as Leg[]).filter((l) => l.kickoff > Date.now()) : EMPTY;
    cached = { raw, legs };
    return legs;
  } catch {
    return EMPTY;
  }
}

function write(legs: Leg[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(legs));
  } catch {
    // Storage blocked: the coupon lasts until the page reloads.
    cached = { raw: JSON.stringify(legs), legs };
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Adds the leg, or removes it if it is already there. A second bet on the same match replaces the first. */
export function toggleLeg(leg: Leg) {
  const legs = read();
  if (legs.some((l) => l.key === leg.key)) return write(legs.filter((l) => l.key !== leg.key));
  const rest = legs.filter((l) => l.eventId !== leg.eventId);
  if (rest.length >= MAX_LEGS) return;
  write([...rest, leg]);
}

export const removeLeg = (key: string) => write(read().filter((l) => l.key !== key));
export const clearLegs = () => write([]);

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useLegs(): Leg[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
